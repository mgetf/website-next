import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getLatestTournament } from '$lib/server/services/tournaments';

export const GET: RequestHandler = async () => {
  try {
    const latestTournament = await getLatestTournament();

    if (!latestTournament) {
      return json({
        id: 0,
        name: 'No tournaments yet',
        startedAt: null,
        winner: null,
        winnerDate: 'TBD',
        prizePool: '$250',
      });
    }

    return json(latestTournament);
  } catch (error) {
    console.error('Error fetching latest tournament:', error);
    return json(
      {
        id: 0,
        name: 'Error loading tournament',
        startedAt: null,
        winner: null,
        winnerDate: 'TBD',
        prizePool: '$250',
      },
      { status: 500 },
    );
  }
};
