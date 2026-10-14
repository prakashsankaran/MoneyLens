/**
 * multer for the in-app API: the dispatcher hands over the upload already
 * read from the FormData, and this applies the same limits multer would.
 */
import { Buffer } from 'buffer';

export interface UploadPart {
  fieldname: string;
  originalname: string;
  mimetype: string;
  bytes: Uint8Array;
}

export class MulterError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code === 'LIMIT_FILE_SIZE' ? 'File too large' : `Unexpected field`);
    this.name = 'MulterError';
  }
}

interface Options {
  limits?: { fileSize?: number; fieldSize?: number };
}

type Next = (err?: unknown) => void;
interface UploadRequest {
  uploadParts?: { fields: Record<string, string>; files: UploadPart[] };
  body?: unknown;
  file?: unknown;
}

function multer(opts: Options = {}) {
  return {
    single(name: string) {
      return (req: UploadRequest, _res: unknown, next: Next) => {
        const parts = req.uploadParts;
        if (!parts) return next();
        const extra = parts.files.find((f) => f.fieldname !== name);
        if (extra || parts.files.length > 1)
          return next(new MulterError('LIMIT_UNEXPECTED_FILE', extra?.fieldname));
        const file = parts.files[0];
        if (
          file &&
          opts.limits?.fileSize !== undefined &&
          file.bytes.length > opts.limits.fileSize
        ) {
          return next(new MulterError('LIMIT_FILE_SIZE', name));
        }
        req.body = { ...parts.fields };
        if (file) {
          const buffer = Buffer.from(
            file.bytes.buffer,
            file.bytes.byteOffset,
            file.bytes.byteLength,
          );
          req.file = {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: buffer.length,
            buffer,
          };
        }
        next();
      };
    },
  };
}
multer.memoryStorage = () => ({});
multer.MulterError = MulterError;

export default multer;
