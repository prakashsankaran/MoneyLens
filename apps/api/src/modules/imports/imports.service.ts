import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { importStats } from '@moneylens/analytics';
import { dayKeyOf, maskIdentifiersInText, paiseToRupeeString } from '@moneylens/shared';
import type {
  ImportConfirmResult,
  ImportRecord,
  ImportReview,
  ImportRow,
  ImportRowUpdateResult,
} from '@moneylens/types';
import type { UpdateImportRowInput } from '@moneylens/validation';
import {
  resolveCategoryAssignment,
  systemCategoryPaths,
  visibleCategoryWhere,
} from '../../lib/categories';
import { AppError, notFound } from '../../lib/errors';
import { findOrCreateMerchant, merchantsByKey } from '../../lib/merchants';
import { decimalToPaise } from '../../lib/money';
import { FLOW_FOR_TYPE } from '../transactions/transactions.service';
import { categorize, type CategorizationContext } from './pipeline/categorize';
import { findDuplicates, type ExistingTransaction } from './pipeline/duplicates';
import { extractMerchantText, merchantKey } from './pipeline/merchants';
import { selectParser } from './pipeline/registry';
import { StatementParseError, type ParseResult, type UploadedFile } from './pipeline/types';

const SUPPORTED = new Set(['csv', 'xlsx', 'pdf']);

/** Statements this large are almost certainly not a personal export. */
export const MAX_ROWS = 20_000;

const rowInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ImportTransactionInclude;
type RowWithCategory = Prisma.ImportTransactionGetPayload<{ include: typeof rowInclude }>;
type ImportModel = Prisma.ImportGetPayload<object>;

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Strip any client-supplied path and control characters from a filename. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(CONTROL_CHARS, '').trim() ?? '';
  return (base || 'statement').slice(0, 200);
}

function sniff(buffer: Buffer): 'pdf' | 'zip' | 'ole' | 'binary' | 'text' {
  const head = buffer.subarray(0, 8);
  // PDF readers accept the marker anywhere in the first kilobyte.
  if (buffer.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'zip';
  if (head.subarray(0, 4).toString('hex') === 'd0cf11e0') return 'ole';
  return buffer.subarray(0, 8192).includes(0) ? 'binary' : 'text';
}

/**
 * Check the bytes, not just the extension: a renamed PDF, spreadsheet or
 * binary is rejected before any parser sees it.
 */
function assertContentMatches(ext: string, buffer: Buffer): void {
  const kind = sniff(buffer);
  const expected = ext === 'csv' ? 'text' : ext === 'xlsx' ? 'zip' : 'pdf';
  if (kind === expected) return;
  const messages: Record<string, string> = {
    csv: 'This file has a .csv name but is not a text CSV file. Export the statement as CSV and try again.',
    xlsx:
      kind === 'ole'
        ? 'This file is an encrypted or old-format Excel workbook. Remove its password, or save it as .xlsx or CSV, and try again.'
        : 'This file has a .xlsx name but is not an Excel workbook.',
    pdf: 'This file has a .pdf name but is not a PDF.',
  };
  throw new AppError('UNSUPPORTED_MEDIA_TYPE', messages[ext] ?? 'Unsupported file.');
}

/** Rows within this many days of a new row are checked for duplicates. */
const DUPLICATE_WINDOW_DAYS = 1;

function dbDate(day: string | null): Date | null {
  return day ? new Date(`${day}T00:00:00.000Z`) : null;
}

function toImportRecord(i: ImportModel): ImportRecord {
  return {
    id: i.id,
    filename: i.originalFilename,
    source: i.source,
    parserName: i.parserName,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    confirmedAt: i.confirmedAt?.toISOString() ?? null,
    statementStart: i.statementStart?.toISOString().slice(0, 10) ?? null,
    statementEnd: i.statementEnd?.toISOString().slice(0, 10) ?? null,
    detectedCount: i.detectedCount,
    duplicateCount: i.duplicateCount,
    committedCount: i.committedCount,
    errorMessage: i.errorMessage,
  };
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toImportRow(r: RowWithCategory): ImportRow {
  return {
    id: r.id,
    rowIndex: r.rowIndex,
    date: r.transactionDate.toISOString(),
    amountPaise: decimalToPaise(r.amount),
    type: r.transactionType,
    flow: r.flow,
    rawDescription: maskIdentifiersInText(r.rawDescription),
    merchantName: r.merchantName,
    category: r.category,
    categoryConfidence: r.categoryConfidence,
    decision: r.decision,
    duplicateReason: r.duplicateReason,
    warnings: stringArray(r.warnings),
  };
}

function statsOf(
  rows: {
    transactionDate: Date;
    amount: Prisma.Decimal;
    flow: 'IN' | 'OUT';
    decision: ImportRow['decision'];
    categoryId: string | null;
  }[],
) {
  return importStats(
    rows.map((r) => ({
      date: r.transactionDate,
      amountPaise: decimalToPaise(r.amount),
      flow: r.flow,
      decision: r.decision,
      categoryId: r.categoryId,
    })),
  );
}

export class ImportsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Parse an uploaded statement into staged rows for review. Nothing is added
   * to the user's transactions until they confirm. The raw file is not kept:
   * only its hash, to recognise the same statement being uploaded twice.
   */
  async upload(userId: string, file: UploadedFile): Promise<ImportReview> {
    const filename = safeFilename(file.filename);
    const ext = fileExtension(filename);
    if (ext === 'xls') {
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Old .xls workbooks are not supported. Open the file in Excel or Google Sheets, save it as .xlsx or CSV, and upload that.',
      );
    }
    if (!SUPPORTED.has(ext)) {
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Upload a Google Pay statement PDF, or a bank statement as .csv or .xlsx.',
      );
    }
    if (file.buffer.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'The file is empty.', {
        fields: { file: 'Empty file' },
      });
    }
    assertContentMatches(ext, file.buffer);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const previous = await this.prisma.import.findFirst({
      where: { userId, sha256, status: { in: ['READY_FOR_REVIEW', 'CONFIRMED'] } },
      select: { id: true, status: true },
    });
    if (previous) {
      throw new AppError(
        'CONFLICT',
        previous.status === 'CONFIRMED'
          ? 'This exact file has already been imported.'
          : 'This file is already waiting for your review.',
        { importId: previous.id, status: previous.status },
      );
    }

    const base = {
      userId,
      originalFilename: filename,
      mimeType: file.mimeType || 'application/octet-stream',
      sizeBytes: file.buffer.length,
      sha256,
    };

    const parser = selectParser({ ...file, filename });
    if (!parser) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'This file format is not supported.');

    let parsed: ParseResult;
    try {
      parsed = await parser.parse({ ...file, filename });
      if (parsed.rows.length === 0) {
        throw new StatementParseError('No transactions were found in this file.');
      }
      if (parsed.rows.length > MAX_ROWS) {
        throw new StatementParseError(
          `This file has more than ${MAX_ROWS.toLocaleString('en-IN')} transactions. Split it into smaller date ranges.`,
        );
      }
    } catch (err) {
      if (!(err instanceof StatementParseError)) throw err;
      // Problems the user can fix on the spot are answered without a history entry.
      if (err.reason !== 'UNREADABLE') {
        throw new AppError('VALIDATION_ERROR', err.message, {
          reason: err.reason,
          ...(err.preview ? { preview: err.preview } : {}),
        });
      }
      // Failed imports stay in the history so the user can see what happened.
      const failed = await this.prisma.import.create({
        data: {
          ...base,
          source: parser.source,
          parserName: parser.name,
          status: 'FAILED',
          errorMessage: err.message,
        },
      });
      return { import: toImportRecord(failed), stats: statsOf([]), rows: [], warnings: [] };
    }

    const ctx = await this.categorizationContext(userId);
    const categorized = parsed.rows.map((row) => categorize(row, ctx));
    const duplicates = findDuplicates(
      parsed.rows.map((row, i) => ({
        date: row.date,
        amountPaise: row.amountPaise,
        flow: row.flow,
        reference: row.reference,
        merchantKey: merchantKey((categorized[i] as (typeof categorized)[number]).merchantName),
        upiId: row.upiId,
      })),
      await this.duplicateCandidates(userId, parsed),
    );

    const staged = parsed.rows.map((row, i) => {
      const c = categorized[i] as (typeof categorized)[number];
      const duplicate = duplicates[i] ?? null;
      return {
        rowIndex: row.rowIndex,
        transactionDate: row.date,
        amount: paiseToRupeeString(row.amountPaise),
        transactionType: row.type,
        flow: row.flow,
        rawDescription: row.description.slice(0, 500),
        merchantName: c.merchantName,
        categoryId: c.categoryId,
        categoryConfidence: c.confidence,
        upiId: row.upiId,
        transactionReference: row.reference,
        decision: duplicate ? ('DUPLICATE' as const) : ('INCLUDE' as const),
        duplicateOfId: duplicate?.duplicateOfId ?? null,
        duplicateReason: duplicate?.reason ?? null,
        warnings: row.warnings.length ? row.warnings : undefined,
      };
    });

    const days = staged.map((r) => dayKeyOf(r.transactionDate)).sort();
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.import.create({
        data: {
          ...base,
          source: parsed.source,
          parserName: parsed.parserName,
          status: 'READY_FOR_REVIEW',
          statementStart: dbDate(days[0] ?? null),
          statementEnd: dbDate(days.at(-1) ?? null),
          detectedCount: staged.length,
          duplicateCount: staged.filter((r) => r.decision === 'DUPLICATE').length,
          warnings: parsed.warnings.length ? parsed.warnings : undefined,
        },
      });
      await tx.importTransaction.createMany({
        data: staged.map((r) => ({ ...r, importId: record.id })),
      });
      return record;
    });

    return this.review(userId, created.id);
  }

  /**
   * The user's transactions that a new row could repeat: those around the
   * statement's dates, plus any sharing a reference number regardless of date.
   */
  private async duplicateCandidates(
    userId: string,
    parsed: ParseResult,
  ): Promise<ExistingTransaction[]> {
    const times = parsed.rows.map((r) => r.date.getTime());
    const margin = (DUPLICATE_WINDOW_DAYS + 1) * 86_400_000;
    const from = new Date(Math.min(...times) - margin);
    const to = new Date(Math.max(...times) + margin);
    const references = parsed.rows.map((r) => r.reference).filter((r): r is string => !!r);
    const found = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          { transactionDate: { gte: from, lte: to } },
          ...(references.length ? [{ transactionReference: { in: references } }] : []),
        ],
      },
      select: {
        id: true,
        transactionDate: true,
        amount: true,
        flow: true,
        transactionReference: true,
        merchantName: true,
        upiId: true,
      },
      orderBy: { transactionDate: 'asc' },
    });
    return found.map((t) => ({
      id: t.id,
      date: t.transactionDate,
      amountPaise: decimalToPaise(t.amount),
      flow: t.flow,
      reference: t.transactionReference,
      merchantKey: t.merchantName ? merchantKey(t.merchantName) : null,
      upiId: t.upiId,
    }));
  }

  private async categorizationContext(userId: string): Promise<CategorizationContext> {
    const [rules, merchants, categoryIdByPath] = await Promise.all([
      this.prisma.userCategoryRule.findMany({
        where: { userId },
        select: { matchField: true, pattern: true, categoryId: true, priority: true },
      }),
      merchantsByKey(this.prisma, userId),
      systemCategoryPaths(this.prisma),
    ]);
    return { rules, merchantsByKey: merchants, categoryIdByPath };
  }

  async list(userId: string): Promise<ImportRecord[]> {
    const rows = await this.prisma.import.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toImportRecord);
  }

  private async findOwned(userId: string, id: string) {
    const record = await this.prisma.import.findFirst({ where: { id, userId } });
    if (!record) throw notFound('Import not found');
    return record;
  }

  async review(userId: string, id: string): Promise<ImportReview> {
    const record = await this.findOwned(userId, id);
    const rows = await this.prisma.importTransaction.findMany({
      where: { importId: id },
      include: rowInclude,
      orderBy: { rowIndex: 'asc' },
    });
    return {
      import: toImportRecord(record),
      stats: statsOf(rows),
      rows: rows.map(toImportRow),
      warnings: stringArray(record.warnings),
    };
  }

  private assertReviewable(record: ImportModel): void {
    if (record.status !== 'READY_FOR_REVIEW') {
      throw new AppError('CONFLICT', 'This import can no longer be changed.', {
        status: record.status,
      });
    }
  }

  async updateRow(
    userId: string,
    importId: string,
    rowId: string,
    input: UpdateImportRowInput,
  ): Promise<ImportRowUpdateResult> {
    const record = await this.findOwned(userId, importId);
    this.assertReviewable(record);
    const row = await this.prisma.importTransaction.findFirst({ where: { id: rowId, importId } });
    if (!row) throw notFound('Row not found');

    const data: Prisma.ImportTransactionUncheckedUpdateInput = {};
    if (input.decision !== undefined) data.decision = input.decision;
    if (input.categoryId !== undefined) {
      // Validates that the category is visible to this user.
      await resolveCategoryAssignment(this.prisma, userId, input.categoryId);
      data.categoryId = input.categoryId;
      data.categoryConfidence = input.categoryId ? 1 : null;
    }
    if (input.merchantName !== undefined) data.merchantName = input.merchantName;
    if (input.transactionType !== undefined) {
      data.transactionType = input.transactionType;
      const flow = FLOW_FOR_TYPE[input.transactionType];
      if (flow) data.flow = flow;
    }

    const { updated, similarUpdated } = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.importTransaction.update({
        where: { id: row.id },
        data,
        include: rowInclude,
      });
      // Rows from the same merchant (as named before this edit) get the same
      // change. Include/exclude stays a per-row choice.
      const { decision: _decision, ...shared } = data;
      const similar =
        input.applyToSimilar && row.merchantName && Object.keys(shared).length
          ? await tx.importTransaction.updateMany({
              where: { importId, id: { not: row.id }, merchantName: row.merchantName },
              data: shared,
            })
          : { count: 0 };
      return { updated: changed, similarUpdated: similar.count };
    });
    const all = await this.prisma.importTransaction.findMany({
      where: { importId },
      select: { transactionDate: true, amount: true, flow: true, decision: true, categoryId: true },
    });
    return { row: toImportRow(updated), stats: statsOf(all), similarUpdated };
  }

  /**
   * Commit the rows the user kept. Merchants are created (with the statement
   * text remembered as an alias) and every new transaction links back to this
   * import, so deleting the import removes exactly what it added.
   */
  async confirm(userId: string, id: string): Promise<ImportConfirmResult> {
    const record = await this.findOwned(userId, id);
    this.assertReviewable(record);

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Re-check inside the transaction so a double submit cannot commit twice.
        const claimed = await tx.import.updateMany({
          where: { id, userId, status: 'READY_FOR_REVIEW' },
          data: { status: 'PARSING' },
        });
        if (claimed.count === 0) {
          throw new AppError('CONFLICT', 'This import can no longer be changed.');
        }

        const rows = await tx.importTransaction.findMany({
          where: { importId: id, decision: 'INCLUDE' },
          orderBy: { rowIndex: 'asc' },
        });

        const categories = await tx.category.findMany({
          where: visibleCategoryWhere(userId),
          select: { id: true, parentId: true },
        });
        const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));

        const merchantIds = new Map<string, string>();
        const txIds: string[] = [];
        const data: Prisma.TransactionCreateManyInput[] = [];
        for (const row of rows) {
          let merchantId: string | null = null;
          if (row.merchantName && row.merchantName !== 'Unknown') {
            const cacheKey = row.merchantName.toUpperCase();
            merchantId = merchantIds.get(cacheKey) ?? null;
            if (!merchantId) {
              const merchant = await findOrCreateMerchant(tx, userId, row.merchantName, {
                rawAlias: row.rawDescription ? extractMerchantText(row.rawDescription) : undefined,
                defaultCategoryId: row.categoryId,
                confidence: row.categoryConfidence ?? 0,
              });
              merchantId = merchant.id;
              merchantIds.set(cacheKey, merchantId);
            }
          }

          // A category deleted since upload is dropped rather than failing the import.
          const known = row.categoryId !== null && parentOf.has(row.categoryId);
          const parentId = known ? parentOf.get(row.categoryId as string) : null;
          const transactionId = randomUUID();
          txIds.push(transactionId);
          data.push({
            id: transactionId,
            userId,
            transactionDate: row.transactionDate,
            amount: row.amount,
            transactionType: row.transactionType,
            flow: row.flow,
            merchantId,
            merchantName: row.merchantName,
            description: row.rawDescription,
            categoryId: known ? (parentId ?? row.categoryId) : null,
            subcategoryId: known && parentId ? row.categoryId : null,
            categoryConfidence: known ? row.categoryConfidence : null,
            paymentMethod: row.upiId ? 'UPI' : null,
            upiId: row.upiId,
            transactionReference: row.transactionReference,
            source: record.source,
            sourceFileId: id,
            status: 'CONFIRMED',
          });
        }

        if (data.length) {
          await tx.transaction.createMany({ data });
          const rowIds = rows.map((r) => r.id);
          await tx.$executeRaw`
            UPDATE "ImportTransaction" AS r SET "committedId" = v.tid
            FROM unnest(${rowIds}::text[], ${txIds}::text[]) AS v(rid, tid)
            WHERE r.id = v.rid
          `;
        }

        return tx.import.update({
          where: { id },
          data: { status: 'CONFIRMED', committedCount: data.length, confirmedAt: new Date() },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    return { import: toImportRecord(result), committed: result.committedCount };
  }

  /** Delete an import and every transaction it added. */
  async remove(userId: string, id: string): Promise<{ transactions: number }> {
    await this.findOwned(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const transactions = await tx.transaction.deleteMany({ where: { userId, sourceFileId: id } });
      await tx.import.deleteMany({ where: { id, userId } });
      return { transactions: transactions.count };
    });
  }
}
