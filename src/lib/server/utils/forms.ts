/**
 * Form Action Helpers
 * Utilities for handling form submissions in SvelteKit
 */

import { fail, type ActionFailure } from '@sveltejs/kit';
import { z } from 'zod';
import { formatValidationErrors } from './validation';
import { logger } from './logger';

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
 * Form action result type
 */
export type FormResult<T = unknown> = FormSuccess<T> | ActionFailure<FormActionError>;

/**
 * Parse FormData with Zod schema
 * Returns validation errors if parsing fails
 */
export function validateForm<T>(
  formData: FormData,
  schema: z.ZodSchema<T>,
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  try {
    // Convert FormData to plain object
    const data = Object.fromEntries(formData);

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

/**
 * Extract string from FormData with default value
 */
export function getFormString(formData: FormData, key: string, defaultValue: string = ''): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : defaultValue;
}

/**
 * Extract number from FormData with default value
 */
export function getFormNumber(formData: FormData, key: string, defaultValue: number = 0): number {
  const value = formData.get(key);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Extract integer from FormData with default value
 */
export function getFormInt(formData: FormData, key: string, defaultValue: number = 0): number {
  return Math.floor(getFormNumber(formData, key, defaultValue));
}

/**
 * Extract boolean from FormData
 */
export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'on';
  }
  return false;
}

/**
 * Extract array of strings from FormData
 */
export function getFormArray(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

/**
 * Convert FormData to plain object
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    // If key already exists, convert to array
    if (key in obj) {
      const existing = obj[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        obj[key] = [existing, value];
      }
    } else {
      obj[key] = value;
    }
  }

  return obj;
}

/**
 * Wrapper for form actions with validation
 * Handles common patterns: parsing form data, validation, error handling
 */
export async function handleFormAction<TInput, TOutput>(
  formData: FormData,
  schema: z.ZodSchema<TInput>,
  handler: (data: TInput) => Promise<TOutput>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    logAction?: string;
    userId?: string;
  },
): Promise<FormResult<TOutput>> {
  try {
    // Log the action if specified
    if (options?.logAction) {
      await logger.formAction(options.logAction, options.userId, Object.fromEntries(formData));
    }

    // Validate form data
    const validation = validateForm(formData, schema);

    if (!validation.success) {
      return validationError(validation.errors);
    }

    // Execute handler
    const result = await handler(validation.data);

    // Return success
    return formSuccess(result, options?.successMessage);
  } catch (err) {
    // Log error
    logger.error('Form action error', err);

    // Return error response
    const message =
      options?.errorMessage || (err instanceof Error ? err.message : 'An error occurred');

    return formError(message, 500);
  }
}

/**
 * Check if result is a success
 */
export function isFormSuccess<T>(result: FormResult<T>): result is FormSuccess<T> {
  return 'success' in result && result.success === true;
}

/**
 * Check if result is an error
 */
export function isFormError(result: FormResult<unknown>): result is ActionFailure<FormActionError> {
  return 'data' in result && 'error' in (result as ActionFailure<FormActionError>).data;
}
