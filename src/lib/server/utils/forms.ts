/**
 * Form Action Helpers
 * Utilities for handling form submissions in SvelteKit
 */

import { fail, type ActionFailure } from '@sveltejs/kit';
import { z } from 'zod';
import { formatValidationErrors } from './validation';

/**
 * Success result from form action
 */
export interface FormSuccess<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

/**
 * Error result from form action
 */
export interface FormActionError {
  error: string;
  errors?: Record<string, string>;
}

/**
 * Parse FormData with Zod schema
 * Returns validation errors if parsing fails
 */
export function validateForm<T>(
  formData: FormData,
  schema: z.ZodSchema<T>,
  arrayKeys?: string[],
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  try {
    // Convert FormData to plain object
    const data: Record<string, unknown> = Object.fromEntries(formData);
    if (arrayKeys) {
      for (const key of arrayKeys) {
        data[key] = formData.getAll(key).filter((v): v is string => typeof v === 'string');
      }
    }

    // Parse with Zod
    const parsed = schema.parse(data);

    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        errors: formatValidationErrors(err),
      };
    }
    throw err;
  }
}

/**
 * Create a success response for form actions
 */
export function formSuccess<T = unknown>(data?: T, message?: string): FormSuccess<T> {
  return {
    success: true,
    ...(data && { data }),
    ...(message && { message }),
  };
}

/**
 * Create an error response for form actions
 */
export function formError(
  message: string,
  statusCode: number = 400,
  errors?: Record<string, string>,
): ActionFailure<FormActionError> {
  return fail(statusCode, {
    error: message,
    ...(errors && { errors }),
  });
}

/**
 * Create validation error response
 */
export function validationError(
  errors: Record<string, string>,
  message: string = 'Validation failed',
): ActionFailure<FormActionError> {
  return fail(400, {
    error: message,
    errors,
  });
}
