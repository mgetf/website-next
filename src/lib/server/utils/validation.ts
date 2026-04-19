/**
 * Validation Utilities using Zod
 * Common validation schemas and helpers
 */

import { z } from 'zod';

// ===== Common Field Schemas =====

/**
 * Extract validation errors into a flat object
 * { fieldName: errorMessage }
 */
export function formatValidationErrors(errors: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};

  errors.issues.forEach((issue) => {
    const path = issue.path.join('.');
    formatted[path] = issue.message;
  });

  return formatted;
}
