import { prisma } from '$lib/server/db';
import { notFound, badRequest, internalError } from '$lib/server/utils/errors';
import type { Prisma } from '$prisma/client.js';

export interface CreatePlayoffParams {
  seasonId: number;
  numRounds?: number;
  doubleElim?: number;
  isTournament: boolean;
}

export interface UpdatePlayoffParams {
  numRounds?: number;
  doubleElim?: number;
  isTournament?: boolean;
}

/**
 * Get playoff configuration for a specific season
 */
export async function getPlayoffBySeason(seasonId: number) {
  try {
    const { isRamaBackend } = await import('$lib/server/rama/config');
    if (isRamaBackend()) {
      void seasonId;
      return null;
    }

    const playoff = await prisma.playoff.findFirst({
      where: { seasonId },
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
    });

    return playoff;
  } catch (err) {
    console.error('Error fetching playoff by season:', err);
    internalError('Failed to fetch playoff configuration');
  }
}

/**
 * Get all playoffs with season information
 */
export async function getAllPlayoffs() {
  try {
    const { isRamaBackend } = await import('$lib/server/rama/config');
    if (isRamaBackend()) return [];

    const playoffs = await prisma.playoff.findMany({
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
      orderBy: [{ season: { regionId: 'asc' } }, { season: { seasonNum: 'desc' } }],
    });

    return playoffs;
  } catch (err) {
    console.error('Error fetching all playoffs:', err);
    internalError('Failed to fetch playoffs');
  }
}

/**
 * Create a new playoff configuration
 */
export async function createPlayoff(params: CreatePlayoffParams) {
  const { seasonId, numRounds, doubleElim, isTournament } = params;

  try {
    // Check if season exists
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
    });

    if (!season) {
      notFound('Season not found');
    }

    // Check if playoff already exists for this season
    const existingPlayoff = await prisma.playoff.findFirst({
      where: { seasonId },
    });

    if (existingPlayoff) {
      badRequest('Playoff configuration already exists for this season');
    }

    // Create playoff
    const playoff = await prisma.playoff.create({
      data: {
        seasonId,
        numRounds: numRounds || null,
        doubleElim: doubleElim || 0,
        isTournament,
      },
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
    });

    return playoff;
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error creating playoff:', err);
    internalError('Failed to create playoff configuration');
  }
}

/**
 * Update an existing playoff configuration
 */
export async function updatePlayoff(playoffId: number, params: UpdatePlayoffParams) {
  const { numRounds, doubleElim, isTournament } = params;

  try {
    // Check if playoff exists
    const existingPlayoff = await prisma.playoff.findUnique({
      where: { id: playoffId },
    });

    if (!existingPlayoff) {
      notFound('Playoff configuration not found');
    }

    // Update playoff
    const playoff = await prisma.playoff.update({
      where: { id: playoffId },
      data: {
        numRounds: numRounds !== undefined ? numRounds : existingPlayoff.numRounds,
        doubleElim: doubleElim !== undefined ? doubleElim : existingPlayoff.doubleElim,
        isTournament: isTournament !== undefined ? isTournament : existingPlayoff.isTournament,
      },
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
    });

    return playoff;
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error updating playoff:', err);
    internalError('Failed to update playoff configuration');
  }
}

/**
 * Update playoff by season ID
 */
export async function updatePlayoffBySeason(seasonId: number, params: UpdatePlayoffParams) {
  try {
    const existingPlayoff = await prisma.playoff.findFirst({
      where: { seasonId },
    });

    if (!existingPlayoff) {
      notFound('Playoff configuration not found for this season');
    }

    return await updatePlayoff(existingPlayoff.id, params);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error updating playoff by season:', err);
    internalError('Failed to update playoff configuration');
  }
}
