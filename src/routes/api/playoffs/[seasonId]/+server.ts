import { json } from '@sveltejs/kit';
import {
  getPlayoffBySeason,
  updatePlayoffBySeason,
  deletePlayoff,
} from '$lib/server/services/playoffs';
import { requireAdmin } from '$lib/server/auth/permissions';
import type { RequestHandler } from './$types';

/**
 * GET /api/playoffs/[seasonId]
 * Get playoff configuration for a specific season
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const seasonId = parseInt(params.seasonId);

    if (isNaN(seasonId)) {
      return json({ error: 'Invalid season ID' }, { status: 400 });
    }

    const playoff = await getPlayoffBySeason(seasonId);

    if (!playoff) {
      return json(
        { error: 'Playoff configuration not found for this season' },
        { status: 404 },
      );
    }

    return json({ data: playoff });
  } catch (err) {
    console.error('Error in GET /api/playoffs/[seasonId]:', err);
    if (err instanceof Error && 'status' in err) {
      return json({ error: err.message }, { status: (err as any).status });
    }
    return json(
      { error: 'Failed to fetch playoff configuration' },
      { status: 500 },
    );
  }
};

/**
 * PUT /api/playoffs/[seasonId]
 * Update playoff configuration for a specific season
 * Requires admin privileges
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  try {
    // Require admin authorization
    requireAdmin(locals.user);

    const seasonId = parseInt(params.seasonId);

    if (isNaN(seasonId)) {
      return json({ error: 'Invalid season ID' }, { status: 400 });
    }

    const data = await request.json();
    const { numRounds, doubleElim, isTournament } = data;

    // Validate data types
    if (isTournament !== undefined && typeof isTournament !== 'boolean') {
      return json({ error: 'isTournament must be a boolean' }, { status: 400 });
    }

    if (
      numRounds !== undefined &&
      (typeof numRounds !== 'number' || numRounds < 1)
    ) {
      return json(
        { error: 'numRounds must be a number >= 1' },
        { status: 400 },
      );
    }

    if (
      doubleElim !== undefined &&
      (typeof doubleElim !== 'number' || (doubleElim !== 0 && doubleElim !== 1))
    ) {
      return json({ error: 'doubleElim must be 0 or 1' }, { status: 400 });
    }

    const playoff = await updatePlayoffBySeason(seasonId, {
      numRounds,
      doubleElim,
      isTournament,
    });

    return json({ data: playoff });
  } catch (err) {
    console.error('Error in PUT /api/playoffs/[seasonId]:', err);
    if (err instanceof Error && 'status' in err) {
      return json({ error: err.message }, { status: (err as any).status });
    }
    return json(
      { error: 'Failed to update playoff configuration' },
      { status: 500 },
    );
  }
};

/**
 * DELETE /api/playoffs/[seasonId]
 * Delete playoff configuration for a specific season
 * Requires admin privileges
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    // Require admin authorization
    requireAdmin(locals.user);

    const seasonId = parseInt(params.seasonId);

    if (isNaN(seasonId)) {
      return json({ error: 'Invalid season ID' }, { status: 400 });
    }

    // First get the playoff to get its ID
    const playoff = await getPlayoffBySeason(seasonId);

    if (!playoff) {
      return json(
        { error: 'Playoff configuration not found for this season' },
        { status: 404 },
      );
    }

    await deletePlayoff(playoff.id);

    return json({ message: 'Playoff configuration deleted successfully' });
  } catch (err) {
    console.error('Error in DELETE /api/playoffs/[seasonId]:', err);
    if (err instanceof Error && 'status' in err) {
      return json({ error: err.message }, { status: (err as any).status });
    }
    return json(
      { error: 'Failed to delete playoff configuration' },
      { status: 500 },
    );
  }
};
