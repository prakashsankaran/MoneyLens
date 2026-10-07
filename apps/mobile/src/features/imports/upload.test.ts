import { ApiError } from '@/lib/api';
import { needsInput } from './upload';

describe('needsInput', () => {
  it('recognises errors the person can fix', () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'This PDF needs a password.', {
      reason: 'PASSWORD_REQUIRED',
    });
    expect(needsInput(err)).toEqual({
      reason: 'PASSWORD_REQUIRED',
      message: 'This PDF needs a password.',
    });
  });

  it('ignores every other error', () => {
    expect(needsInput(new ApiError(400, 'VALIDATION_ERROR', 'Bad file'))).toBeNull();
    expect(
      needsInput(
        new ApiError(409, 'CONFLICT', 'Already imported', { reason: 'PASSWORD_REQUIRED' }),
      ),
    ).toBeNull();
    expect(needsInput(new Error('boom'))).toBeNull();
  });
});
