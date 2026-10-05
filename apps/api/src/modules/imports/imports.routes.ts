import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { columnMappingSchema, updateImportRowSchema } from '@moneylens/validation';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { ImportsService } from './imports.service';

/**
 * Accept a single `file` field into memory, plus optional `password` (for a
 * protected PDF; used once and never stored or logged) and `mapping` fields. The file is parsed and discarded;
 * it is never written to disk or served back.
 */
function singleFileUpload(maxUploadMb: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.floor(maxUploadMb * 1024 * 1024),
      files: 1,
      fields: 2,
      fieldSize: 8 * 1024,
      parts: 3,
    },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('PAYLOAD_TOO_LARGE', `Files must be ${maxUploadMb} MB or smaller.`),
          );
        }
        return next(
          new AppError('VALIDATION_ERROR', 'Upload one statement file in the "file" field.', {
            fields: { file: err.message },
          }),
        );
      }
      next(err);
    });
  };
}

export function importRoutes(service: ImportsService, opts: { maxUploadMb: number }): Router {
  const router = Router();

  router.post('/', singleFileUpload(opts.maxUploadMb), async (req, res) => {
    const userId = requireUserId(req);
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'Choose a statement file to upload.', {
        fields: { file: 'Required' },
      });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' && body.password ? body.password : undefined;
    let mapping;
    if (typeof body.mapping === 'string' && body.mapping) {
      let json: unknown;
      try {
        json = JSON.parse(body.mapping);
      } catch {
        throw new AppError('VALIDATION_ERROR', 'The column choice could not be read.', {
          fields: { mapping: 'Invalid JSON' },
        });
      }
      mapping = parseInput(columnMappingSchema, json);
    }
    const review = await service.upload(userId, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      password,
      mapping,
    });
    ok(res, review, 201);
  });

  router.get('/', async (req, res) => {
    ok(res, await service.list(requireUserId(req)));
  });

  router.get('/:id', async (req, res) => {
    ok(res, await service.review(requireUserId(req), req.params.id));
  });

  router.patch('/:id/rows/:rowId', async (req, res) => {
    const input = parseInput(updateImportRowSchema, req.body);
    ok(res, await service.updateRow(requireUserId(req), req.params.id, req.params.rowId, input));
  });

  router.post('/:id/confirm', async (req, res) => {
    ok(res, await service.confirm(requireUserId(req), req.params.id));
  });

  router.delete('/:id', async (req, res) => {
    ok(res, { deleted: true, ...(await service.remove(requireUserId(req), req.params.id)) });
  });

  return router;
}
