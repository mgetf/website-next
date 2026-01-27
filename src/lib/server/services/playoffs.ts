import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';
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
    throw error(500, 'Failed to fetch playoff configuration');
  }
}

/**
 * Get all playoffs with season information
 */
export async function getAllPlayoffs() {
  try {
    const playoffs = await prisma.playoff.findMany({
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
      orderBy: [
        { season: { regionId: 'asc' } },
        { season: { seasonNum: 'desc' } },
      ],
    });

    return playoffs;
  } catch (err) {
    console.error('Error fetching all playoffs:', err);
    throw error(500, 'Failed to fetch playoffs');
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
      throw error(404, 'Season not found');
    }

    // Check if playoff already exists for this season
    const existingPlayoff = await prisma.playoff.findFirst({
      where: { seasonId },
    });

    if (existingPlayoff) {
      throw error(400, 'Playoff configuration already exists for this season');
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
    throw error(500, 'Failed to create playoff configuration');
  }
}

/**
 * Update an existing playoff configuration
 */
export async function updatePlayoff(
  playoffId: number,
  params: UpdatePlayoffParams,
) {
  const { numRounds, doubleElim, isTournament } = params;

  try {
    // Check if playoff exists
    const existingPlayoff = await prisma.playoff.findUnique({
      where: { id: playoffId },
    });

    if (!existingPlayoff) {
      throw error(404, 'Playoff configuration not found');
    }

    // Update playoff
    const playoff = await prisma.playoff.update({
      where: { id: playoffId },
      data: {
        numRounds:
          numRounds !== undefined ? numRounds : existingPlayoff.numRounds,
        doubleElim:
          doubleElim !== undefined ? doubleElim : existingPlayoff.doubleElim,
        isTournament:
          isTournament !== undefined
            ? isTournament
            : existingPlayoff.isTournament,
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
    throw error(500, 'Failed to update playoff configuration');
  }
}

/**
 * Update playoff by season ID
 */
export async function updatePlayoffBySeason(
  seasonId: number,
  params: UpdatePlayoffParams,
) {
  try {
    const existingPlayoff = await prisma.playoff.findFirst({
      where: { seasonId },
    });

    if (!existingPlayoff) {
      throw error(404, 'Playoff configuration not found for this season');
    }

    return await updatePlayoff(existingPlayoff.id, params);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error updating playoff by season:', err);
    throw error(500, 'Failed to update playoff configuration');
  }
}

/**
 * Delete a playoff configuration
 */
export async function deletePlayoff(playoffId: number) {
  try {
    // Check if playoff exists
    const existingPlayoff = await prisma.playoff.findUnique({
      where: { id: playoffId },
    });

    if (!existingPlayoff) {
      throw error(404, 'Playoff configuration not found');
    }

    // Check if there are any matches associated with this playoff
    const matchesCount = await prisma.match.count({
      where: { playoffId },
    });

    if (matchesCount > 0) {
      throw error(
        400,
        'Cannot delete playoff configuration with existing matches',
      );
    }

    // Delete playoff
    await prisma.playoff.delete({
      where: { id: playoffId },
    });

    return { success: true };
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error deleting playoff:', err);
    throw error(500, 'Failed to delete playoff configuration');
  }
}

/**
 * Get playoff rounds for dropdown display
 */
export function getPlayoffRounds(numRounds: number, doubleElim: boolean) {
  const rounds: { value: number; label: string }[] = [];

  // Upper bracket rounds (positive numbers)
  for (let i = 1; i <= numRounds; i++) {
    rounds.push({
      value: i,
      label: `Upper Round ${i}`,
    });
  }

  // Lower bracket rounds (negative numbers) if double elimination
  if (doubleElim) {
    for (let i = 1; i <= numRounds * 2; i++) {
      rounds.push({
        value: -i,
        label: `Lower Round ${i}`,
      });
    }
  }

  return rounds;
}

/**
 * Calculate number of matches for a playoff round
 */
export function calculateMatchesForRound(
  numRounds: number,
  currentRound: number,
): number {
  // For upper bracket rounds (positive numbers)
  if (currentRound > 0) {
    return Math.pow(2, numRounds - currentRound);
  }

  // For lower bracket rounds (negative numbers)
  // This is a simplified calculation - actual double elimination brackets are more complex
  return Math.pow(2, numRounds - Math.abs(currentRound));
}
