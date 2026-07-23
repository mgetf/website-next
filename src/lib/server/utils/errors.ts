/**
 * Error Handling Utilities
 * Standardized error handling and reporting
 */

import { error, isHttpError } from '@sveltejs/kit';
import { isPrismaLikeError } from './prisma-errors';

/**
 * Throw a 404 Not Found error
 */
export function notFound(message: string = 'Resource not found'): never {
  throw error(404, message);
}

/**
 * Throw a 401 Unauthorized error
 */
export function unauthorized(message: string = 'Authentication required'): never {
  throw error(401, message);
}

/**
 * Throw a 403 Forbidden error
 */
export function forbidden(message: string = 'Insufficient permissions'): never {
  throw error(403, message);
}

/**
 * Throw a 400 Bad Request error
 */
export function badRequest(message: string = 'Invalid request'): never {
  throw error(400, message);
}

/**
 * Throw a 409 Conflict error
 */
export function conflict(message: string = 'Resource state conflict'): never {
  throw error(409, message);
}

/**
 * Throw a 500 Internal Server Error
 */
export function internalError(message: string = 'Internal server error'): never {
  throw error(500, message);
}

/**
 * Extract a human-readable message from an unknown caught value.
 * Handles SvelteKit HttpError (body.message), standard Error, and arbitrary throws.
 * Prisma/database errors are never forwarded to clients.
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (isHttpError(err)) return err.body.message;
  if (isPrismaLikeError(err)) return fallback;
  if (err instanceof Error) return err.message;
  return fallback;
}
