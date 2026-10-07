import { Platform } from 'react-native';
import type { ImportNeedsInputReason, ImportReview } from '@moneylens/types';
import { api, ApiError } from '@/lib/api';
import { KIND_MIME, uploadName, type StatementKind } from './incoming';

/** A statement chosen on the phone. `file` is set only in the web preview. */
export interface PickedFile {
  uri: string;
  name: string;
  kind: StatementKind;
  file?: Blob;
}

export interface NeedsInput {
  reason: ImportNeedsInputReason;
  message: string;
}

/** Send a statement to the API, which parses it and returns the review. */
export function uploadStatement(picked: PickedFile, password?: string): Promise<ImportReview> {
  const body = new FormData();
  if (password) body.append('password', password);
  const name = uploadName(picked.name, picked.kind);
  if (Platform.OS === 'web' && picked.file) {
    body.append('file', picked.file, name);
  } else {
    // React Native streams the file from its URI; nothing is read into memory here.
    body.append('file', { uri: picked.uri, name, type: KIND_MIME[picked.kind] } as unknown as Blob);
  }
  return api<ImportReview>('/imports', { method: 'POST', body });
}

/** Whether an upload error can be fixed by the user (a PDF password, unknown columns). */
export function needsInput(err: unknown): NeedsInput | null {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return null;
  const reason = err.details?.reason;
  if (
    reason !== 'COLUMNS_NOT_FOUND' &&
    reason !== 'PASSWORD_REQUIRED' &&
    reason !== 'PASSWORD_INCORRECT'
  ) {
    return null;
  }
  return { reason, message: err.message };
}
