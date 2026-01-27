import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getLatestChampionship } from '$lib/server/services/championships';

export const GET: RequestHandler = async () => {
  try {
    const latestChampionship = await getLatestChampionship();

    if (!latestChampionship) {
      return json({
        id: 0,
        name: 'No championships yet',
        winner: null,
        status: 0,
        startedAt: null,
        endedAt: null,
        nextDate: 'TBD 2025',
      });
    }

    return json(latestChampionship);
  } catch (error) {
    console.error('Error fetching latest championship:', error);
    return json(
      {
        id: 0,
        name: 'Error loading championship',
        winner: null,
        status: 0,
        startedAt: null,
        endedAt: null,
        nextDate: 'TBD 2025',
      },
      { status: 500 },
    );
  }
};
