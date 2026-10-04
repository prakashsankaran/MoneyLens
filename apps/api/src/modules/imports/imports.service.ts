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
import { extractMerchantText } from './pipeline/merchants';
import { selectParser } from './pipeline/registry';
import { StatementParseError, type ParseResult, type UploadedFile } from './pipeline/types';

/** Formats recognised by extension that are planned but not parsed yet. */
const COMING_SOON = new Set(['pdf', 'xlsx', 'xls']);
const SUPPORTED = new Set(['csv']);

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

/** Strip any client-supplied path and control characters from a filename. */
export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base =
    name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .trim() ?? '';
  return (base || 'statement').slice(0, 200);
}

/**
 * Check the bytes, not just the extension: a renamed PDF, spreadsheet or
 * binary is rejected before any parser sees it.
 */
function assertLooksLikeText(buffer: Buffer): void {
  const head = buffer.subarray(0, 8);
  const isPdf = head.subarray(0, 5).toString('latin1') === '%PDF-';
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const isOle = head.subarray(0, 4).toString('hex') === 'd0cf11e0';
  if (isPdf || isZip || isOle || buffer.subarray(0, 8192).includes(0)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      'This file has a .csv name but is not a text CSV file. Export the statement as CSV and try again.',
    );
  }
}

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
    if (COMING_SOON.has(ext)) {
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        `.${ext} statements are not supported yet (planned for Phase 3). Export the statement as CSV for now.`,
      );
    }
    if (!SUPPORTED.has(ext)) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a .csv statement file.');
    }
    if (file.buffer.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'The file is empty.', {
        fields: { file: 'Empty file' },
      });
    }
    assertLooksLikeText(file.buffer);

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
      mimeType: file.mimeType || 'text/csv',
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
    const references = parsed.rows.map((r) => r.reference).filter((r): r is string => !!r);
    const existingRefs = new Map(
      references.length
        ? (
            await this.prisma.transaction.findMany({
              where: { userId, transactionReference: { in: references } },
              select: { id: true, transactionReference: true },
            })
          ).map((t) => [t.transactionReference as string, t.id])
        : [],
    );

    const staged = parsed.rows.map((row) => {
      const c = categorize(row, ctx);
      const duplicateOfId = row.reference ? (existingRefs.get(row.reference) ?? null) : null;
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
        decision: duplicateOfId ? ('DUPLICATE' as const) : ('INCLUDE' as const),
        duplicateOfId,
        duplicateReason: duplicateOfId
          ? 'Same reference number as a transaction you already have'
          : null,
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

    const updated = await this.prisma.importTransaction.update({
      where: { id: row.id },
      data,
      include: rowInclude,
    });
    const all = await this.prisma.importTransaction.findMany({
      where: { importId },
      select: { transactionDate: true, amount: true, flow: true, decision: true, categoryId: true },
    });
    return { row: toImportRow(updated), stats: statsOf(all) };
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
