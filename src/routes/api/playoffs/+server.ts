import { json } from '@sveltejs/kit';
import { getAllPlayoffs, createPlayoff } from '$lib/server/services/playoffs';
import type { RequestHandler } from './$types';

/**
 * GET /api/playoffs
 * Get all playoff configurations with season information
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const playoffs = await getAllPlayoffs();
    return json({ data: playoffs });
  } catch (err) {
    console.error('Error in GET /api/playoffs:', err);
    return json({ error: 'Failed to fetch playoffs' }, { status: 500 });
  }
};

/**
 * POST /api/playoffs
 * Create a new playoff configuration
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { seasonId, numRounds, doubleElim, isTournament } = data;

    // Validate required fields
    if (!seasonId || typeof seasonId !== 'number') {
      return json(
        { error: 'Season ID is required and must be a number' },
        { status: 400 },
      );
    }

    if (typeof isTournament !== 'boolean') {
      return json({ error: 'isTournament must be a boolean' }, { status: 400 });
    }

    // If not tournament mode, validate numRounds
    if (!isTournament) {
      if (!numRounds || typeof numRounds !== 'number' || numRounds < 1) {
        return json(
          {
            error:
              'Number of rounds is required for non-tournament mode and must be >= 1',
          },
          { status: 400 },
        );
      }
    }

    const playoff = await createPlayoff({
      seasonId,
      numRounds: isTournament ? null : numRounds,
      doubleElim: doubleElim || 0,
      isTournament,
    });

    return json({ data: playoff }, { status: 201 });
  } catch (err) {
    console.error('Error in POST /api/playoffs:', err);
    if (err instanceof Error && 'status' in err) {
      return json({ error: err.message }, { status: (err as any).status });
    }
    return json(
      { error: 'Failed to create playoff configuration' },
      { status: 500 },
    );
  }
};
