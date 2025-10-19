/**
 * Tournaments Listing Page - Server Logic
 * Displays all tournaments (Cups, World Championships, Fight Nights)
 */

import type { PageServerLoad } from './$types';
import { getAllTournaments, getAllFightNights } from '$lib/server/services/tournaments';
import { getAllChampionships } from '$lib/server/services/championships';

export const load: PageServerLoad = async () => {
	const [tournaments, championships, fightNights] = await Promise.all([
		getAllTournaments(),
		getAllChampionships(),
		getAllFightNights()
	]);

	return {
		tournaments,
		championships,
		fightNights
	};
};

