/**
 * Test endpoint for utilities
 * Route: GET /api/test-utils
 * This can be used to verify all utilities are working correctly
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	steamId64FromSteamId32,
	steamId32FromSteamId64,
	isValidSteamId64,
	extractSteamId64
} from '$lib/server/utils/steamid';
import { sanitizeTeamName, sanitizeAcronym, stripHtml } from '$lib/server/utils/sanitization';
import { z } from 'zod';
import { safeValidateFormData, steamIdSchema } from '$lib/server/utils/validation';

export const GET: RequestHandler = async () => {
	const tests = {
		steamId: testSteamId(),
		sanitization: testSanitization(),
		validation: testValidation()
	};

	return json({
		success: true,
		tests,
		message: 'All utility tests completed'
	});
};

function testSteamId() {
	const testId32 = 'STEAM_0:1:123456';
	const testId64 = '76561197960513641';

	return {
		steamId64FromSteamId32: {
			input: testId32,
			output: steamId64FromSteamId32(testId32)
		},
		steamId32FromSteamId64: {
			input: testId64,
			output: steamId32FromSteamId64(testId64)
		},
		isValidSteamId64: {
			valid: isValidSteamId64(testId64),
			invalid: isValidSteamId64('12345')
		},
		extractSteamId64: {
			fromUrl: extractSteamId64(`https://steamcommunity.com/profiles/${testId64}`),
			fromId: extractSteamId64(testId64)
		}
	};
}

function testSanitization() {
	return {
		sanitizeTeamName: {
			input: 'Team <script>alert()</script> Name!!!',
			output: sanitizeTeamName('Team <script>alert()</script> Name!!!')
		},
		sanitizeAcronym: {
			input: 'abc-123',
			output: sanitizeAcronym('abc-123')
		},
		stripHtml: {
			input: '<p>Hello <strong>World</strong></p>',
			output: stripHtml('<p>Hello <strong>World</strong></p>')
		}
	};
}

function testValidation() {
	// Test valid Steam ID
	const validResult = safeValidateFormData(steamIdSchema, '76561197960513641');

	// Test invalid Steam ID
	const invalidResult = safeValidateFormData(steamIdSchema, '12345');

	// Test object validation
	const userSchema = z.object({
		steamId: steamIdSchema,
		username: z.string().min(3)
	});

	const validUser = safeValidateFormData(userSchema, {
		steamId: '76561197960513641',
		username: 'TestUser'
	});

	const invalidUser = safeValidateFormData(userSchema, {
		steamId: '12345',
		username: 'AB'
	});

	return {
		validSteamId: validResult,
		invalidSteamId: {
			success: invalidResult.success,
			errorCount: !invalidResult.success ? invalidResult.errors.errors.length : 0
		},
		validUser: validUser,
		invalidUser: {
			success: invalidUser.success,
			errorCount: !invalidUser.success ? invalidUser.errors.errors.length : 0
		}
	};
}

