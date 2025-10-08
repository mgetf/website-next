import { error } from '@sveltejs/kit';
import { getPlayerProfile } from '$lib/server/services/users';

export const load = async ({ params }: { params: { steamId: string } }) => {
	const { steamId } = params;

	try {
		const profile = await getPlayerProfile(steamId);

		if (!profile) {
			throw error(404, 'Player not found');
		}

		return profile;
	} catch (err) {
		console.error('Error loading player profile:', err);
		
		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		
		// Otherwise, wrap it in a 500 error
		throw error(500, 'Failed to load player profile');
	}
};
