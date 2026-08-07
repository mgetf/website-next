import { describe, expect, it } from 'vitest';
import { error, isHttpError } from '@sveltejs/kit';
import {
  badRequest,
  conflict,
  forbidden,
  getErrorMessage,
  internalError,
  notFound,
  unauthorized,
} from './errors';

function statusOf(fn: () => void): number {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    if (!isHttpError(err)) throw err;
    return err.status;
  }
}

describe('http error helpers', () => {
  it('throws the expected statuses', () => {
    expect(statusOf(() => notFound())).toBe(404);
    expect(statusOf(() => unauthorized())).toBe(401);
    expect(statusOf(() => forbidden())).toBe(403);
    expect(statusOf(() => badRequest())).toBe(400);
    expect(statusOf(() => conflict())).toBe(409);
    expect(statusOf(() => internalError())).toBe(500);
  });
});

describe('getErrorMessage', () => {
  it('reads HttpError body messages', () => {
    try {
      throw error(400, 'Nope');
    } catch (err) {
      expect(getErrorMessage(err)).toBe('Nope');
    }
  });

  it('reads Error messages and falls back otherwise', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('string-throw', 'fallback')).toBe('fallback');
  });

  it('hides Prisma-like errors behind the fallback', () => {
    const prismaLike = {
      name: 'PrismaClientKnownRequestError',
      message: 'Unique constraint failed',
      code: 'P2002',
    };
    expect(getErrorMessage(prismaLike, 'safe')).toBe('safe');
  });
});
