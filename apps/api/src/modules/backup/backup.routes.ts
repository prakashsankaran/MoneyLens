import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { backupFileSchema, REPLACE_CONFIRMATION, type BackupFile } from '@moneylens/validation';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import type { BackupService } from './backup.service';

/** One backup `file` in memory, plus the optional `replace` confirmation. */
function backupUpload(maxUploadMb: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.floor(maxUploadMb * 1024 * 1024),
      files: 1,
      fields: 1,
      fieldSize: 64,
      parts: 2,
    },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return next(
          err.code === 'LIMIT_FILE_SIZE'
            ? new AppError(
                'PAYLOAD_TOO_LARGE',
                `Backup files must be ${maxUploadMb} MB or smaller.`,
              )
            : new AppError('VALIDATION_ERROR', 'Upload one backup file in the "file" field.', {
                fields: { file: err.message },
              }),
        );
      }
      next(err);
    });
  };
}

/** Read and check an uploaded backup, with a message a person can act on. */
export function readBackup(buffer: Buffer): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new AppError(
      'VALIDATION_ERROR',
      'This file is not a MoneyLens backup. Choose the .json file MoneyLens saved.',
    );
  }
  const result = backupFileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const known = issue?.path.length === 1 && ['format', 'version'].includes(String(issue.path[0]));
    throw new AppError(
      'VALIDATION_ERROR',
      known && issue
        ? issue.message
        : 'This backup file is damaged or was changed, so it cannot be restored.',
      { reason: 'INVALID_BACKUP', path: issue?.path.join('.') ?? '' },
    );
  }
  return result.data;
}

export function backupRoutes(service: BackupService, opts: { maxUploadMb: number }): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    ok(res, await service.export(requireUserId(req)));
  });

  router.get('/status', async (req, res) => {
    ok(res, await service.status(requireUserId(req)));
  });

  router.post('/restore', backupUpload(opts.maxUploadMb), async (req, res) => {
    const userId = requireUserId(req);
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'Choose a backup file to restore.', {
        fields: { file: 'Required' },
      });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.replace !== undefined && body.replace !== REPLACE_CONFIRMATION) {
      throw new AppError('VALIDATION_ERROR', `Type ${REPLACE_CONFIRMATION} to confirm.`, {
        fields: { replace: `Type ${REPLACE_CONFIRMATION}` },
      });
    }
    const backup = readBackup(req.file.buffer);
    ok(
      res,
      await service.restore(userId, backup, { replace: body.replace === REPLACE_CONFIRMATION }),
    );
  });

  return router;
}
