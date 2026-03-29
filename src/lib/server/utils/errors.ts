/**
 * Error Handling Utilities
 * Standardized error handling and reporting
 */

import { error, isHttpError, type NumericRange } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { logger } from './logger';

/**
 * Application error types
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public errors?: Record<string, string>,
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Handle errors and convert to SvelteKit error
 */
export function handleError(err: unknown, context?: string): never {
  // Log the error
  if (context) {
    logger.error(`Error in ${context}`, err);
  } else {
    logger.error('Unhandled error', err);
  }

  // Handle different error types
  if (err instanceof AppError) {
    throw error(err.statusCode as NumericRange<400, 599>, err.message);
  }

  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue?.message || 'Validation failed';
    throw error(400, message);
  }

  // Database errors
  if (err && typeof err === 'object' && 'code' in err) {
    const dbError = err as { code: string; message: string };

    // Handle Prisma errors
    if (dbError.code?.startsWith('P')) {
      // Prisma error codes
      if (dbError.code === 'P2002') {
        throw error(409, 'A record with this value already exists');
      }
      if (dbError.code === 'P2025') {
        throw error(404, 'Record not found');
      }
      // Generic database error
      throw error(500, 'Database error');
    }
  }

  // Generic error
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  throw error(500, message);
}

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
export function conflict(message: string = 'Resource conflict'): never {
  throw error(409, message);
}

/**
 * Throw a 500 Internal Server Error
 */
export function internalError(message: string = 'Internal server error'): never {
  throw error(500, message);
}

/**
 * Try-catch wrapper for async functions
 * Automatically handles errors and logs them
 */
export async function tryCatch<T>(fn: () => Promise<T>, context?: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return handleError(err, context);
  }
}

/**
 * Assert condition, throw error if false
 */
export function assert(
  condition: boolean,
  message: string,
  statusCode: number = 400,
): asserts condition {
  if (!condition) {
    throw new AppError(message, statusCode);
  }
}

/**
 * Extract a human-readable message from an unknown caught value.
 * Handles SvelteKit HttpError (body.message), standard Error, and arbitrary throws.
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (isHttpError(err)) return err.body.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
