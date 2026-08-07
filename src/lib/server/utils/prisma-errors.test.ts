import { describe, expect, it } from 'vitest';
import { isPrismaLikeError } from './prisma-errors';

describe('isPrismaLikeError', () => {
  it('detects PrismaClient* errors', () => {
    expect(
      isPrismaLikeError({
        name: 'PrismaClientKnownRequestError',
        message: 'Unique constraint failed',
        code: 'P2002',
      }),
    ).toBe(true);
  });

  it('rejects unrelated values', () => {
    expect(isPrismaLikeError(new Error('nope'))).toBe(false);
    expect(isPrismaLikeError({ name: 'Error', message: 'x' })).toBe(false);
    expect(isPrismaLikeError(null)).toBe(false);
  });
});
