/**
 * Validation Utilities using Zod
 * Common validation schemas and helpers
 */

import { z } from 'zod';

// ===== Common Field Schemas =====

/**
 * Steam ID 64 validation
 * Must be a 17-digit string starting with 7656119
 */
export const steamIdSchema = z
	.string()
	.regex(/^\d{17}$/, 'Steam ID must be 17 digits')
	.refine((id) => id.startsWith('7656119'), 'Invalid Steam ID format');

/**
 * Team name validation
 * 3-50 characters, alphanumeric with spaces and basic punctuation
 */
export const teamNameSchema = z
	.string()
	.min(3, 'Team name must be at least 3 characters')
	.max(50, 'Team name must be at most 50 characters')
	.regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Team name can only contain letters, numbers, spaces, and -_.');

/**
 * Team acronym validation
 * 2-6 characters, letters and numbers only
 */
export const teamAcronymSchema = z
	.string()
	.min(2, 'Acronym must be at least 2 characters')
	.max(6, 'Acronym must be at most 6 characters')
	.regex(/^[a-zA-Z0-9]+$/, 'Acronym can only contain letters and numbers');

/**
 * URL validation (optional field)
 */
export const urlSchema = z
	.string()
	.url('Must be a valid URL')
	.optional()
	.or(z.literal(''));

/**
 * Discord username validation
 */
export const discordUsernameSchema = z
	.string()
	.min(2, 'Discord username must be at least 2 characters')
	.max(32, 'Discord username must be at most 32 characters');

/**
 * Positive integer ID validation
 */
export const idSchema = z
	.number()
	.int('Must be an integer')
	.positive('Must be positive');

/**
 * Non-empty string validation
 */
export const nonEmptyStringSchema = z
	.string()
	.min(1, 'This field is required')
	.trim();

// ===== Form Schemas =====

/**
 * Team creation form schema
 */
export const createTeamSchema = z.object({
	name: teamNameSchema,
	acronym: teamAcronymSchema,
	divisionId: idSchema,
	seasonId: idSchema,
	regionId: idSchema,
	password: z
		.string()
		.min(4, 'Password must be at least 4 characters')
		.max(50, 'Password must be at most 50 characters')
});

/**
 * Team update form schema
 */
export const updateTeamSchema = z.object({
	name: teamNameSchema.optional(),
	acronym: teamAcronymSchema.optional(),
	avatarUrl: urlSchema.optional(),
	password: z
		.string()
		.min(4, 'Password must be at least 4 characters')
		.max(50, 'Password must be at most 50 characters')
		.optional()
});

/**
 * Match score submission schema
 */
export const submitMatchScoreSchema = z.object({
	matchId: idSchema,
	team1Score: z.number().int().min(0).max(20),
	team2Score: z.number().int().min(0).max(20),
	password: z.string().min(1, 'Team password is required')
});

/**
 * Game score schema (individual game within a match)
 */
export const gameScoreSchema = z.object({
	arenaId: idSchema,
	team1Score: z.number().int().min(0).max(20),
	team2Score: z.number().int().min(0).max(20)
});

/**
 * Forum post schema
 */
export const forumPostSchema = z.object({
	title: z
		.string()
		.min(5, 'Title must be at least 5 characters')
		.max(100, 'Title must be at most 100 characters'),
	content: z
		.string()
		.min(10, 'Content must be at least 10 characters')
		.max(5000, 'Content must be at most 5000 characters')
});

/**
 * Payment checkout schema
 */
export const paymentCheckoutSchema = z.object({
	steamId: steamIdSchema,
	teamId: idSchema,
	amount: z.number().positive('Amount must be positive'),
	currency: z.enum(['USD', 'EUR'])
});

// ===== Validation Helpers =====

/**
 * Parse and validate form data with Zod schema
 * Returns typed data or throws error
 */
export function validateFormData<T>(
	schema: z.ZodSchema<T>,
	data: unknown
): T {
	return schema.parse(data);
}

/**
 * Safe validation that returns result with errors
 */
export function safeValidateFormData<T>(
	schema: z.ZodSchema<T>,
	data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
	const result = schema.safeParse(data);

	if (result.success) {
		return { success: true, data: result.data };
	} else {
		return { success: false, errors: result.error };
	}
}

/**
 * Extract validation errors into a flat object
 * { fieldName: errorMessage }
 */
export function formatValidationErrors(
	errors: z.ZodError
): Record<string, string> {
	const formatted: Record<string, string> = {};

	errors.errors.forEach((error) => {
		const path = error.path.join('.');
		formatted[path] = error.message;
	});

	return formatted;
}

/**
 * Validate integer from string (for form inputs)
 */
export function parseIntSafe(value: unknown, defaultValue: number = 0): number {
	if (typeof value === 'number') return Math.floor(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		return isNaN(parsed) ? defaultValue : parsed;
	}
	return defaultValue;
}

/**
 * Validate boolean from string (for checkboxes)
 */
export function parseBooleanSafe(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		return value === 'true' || value === '1' || value === 'on';
	}
	return false;
}

