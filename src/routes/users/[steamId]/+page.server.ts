import { error } from '@sveltejs/kit';
import { getPlayerProfile } from '$lib/server/services/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { steamId } = params;

	try {
		const profile = await getPlayerProfile(steamId);

		if (!profile) {
			throw error(404, 'User not found');
		}

		// Check if user is viewing their own profile
		const isOwnProfile = locals.user?.steamId === steamId;

		return {
			...profile,
			isOwnProfile
		};
	} catch (err) {
		console.error('Error loading user profile:', err);
		
		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		
		// Otherwise, wrap it in a 500 error
		throw error(500, 'Failed to load user profile');
	}
};

