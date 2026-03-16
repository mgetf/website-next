/**
 * Season Service
 *
 * All season-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '$prisma/client.js';

/**
 * Get all seasons with their region and team/match counts
 * Ordered by season number descending (most recent first)
 */
export async function getSeasons() {
  return await prisma.season.findMany({
    include: {
      region: true,
      format: true,
      _count: {
        select: {
          teams: true,
          matches: true,
        },
      },
    },
    orderBy: {
      seasonNum: 'desc',
    },
  });
}

/**
 * Get a single season by ID
 */
export async function getSeasonById(id: number) {
  return await prisma.season.findUnique({
    where: { id },
    include: {
      region: true,
      format: true,
      _count: {
        select: {
          teams: true,
          matches: true,
        },
      },
    },
  });
}

/**
 * Get the current (most recent) season
 */
export async function getCurrentSeason() {
  return await prisma.season.findFirst({
    orderBy: { seasonNum: 'desc' },
    include: { region: true },
  });
}

/**
 * Get the current (most recent) season for a specific format
 */
export async function getCurrentSeasonByFormat(formatId: number) {
  return await prisma.season.findFirst({
    where: { formatId },
    orderBy: [{ seasonNum: 'desc' }, { signupsOpen: 'desc' }],
    include: { region: true },
  });
}

/**
 * Create a new season
 *
 * Business logic validation:
 * - Season number must be unique per region and format
 */
export async function createSeason(data: {
  seasonNum: number;
  regionId: number;
  formatId: number;
  numWeeks: number;
}) {
  // Check if season already exists for this region and format
  const existingSeason = await prisma.season.findFirst({
    where: {
      seasonNum: data.seasonNum,
      regionId: data.regionId,
      formatId: data.formatId,
    },
  });

  if (existingSeason) {
    throw new Error(
      `Season ${data.seasonNum} already exists for this region and format`,
    );
  }

  return await prisma.season.create({
    data: {
      seasonNum: data.seasonNum,
      regionId: data.regionId,
      formatId: data.formatId,
      numWeeks: data.numWeeks,
    },
  });
}

/**
 * Update an existing season
 *
 * Business logic validation:
 * - Season must exist
 * - New season number must not conflict with another season in the same region and format
 */
export async function updateSeason(
  id: number,
  data: {
    seasonNum: number;
    regionId: number;
    formatId: number;
    numWeeks: number;
  },
) {
  // Check if season exists
  const season = await prisma.season.findUnique({
    where: { id },
  });

  if (!season) {
    throw new Error('Season not found');
  }

  // Check if changing to a season number that already exists for this region and format
  const conflictingSeason = await prisma.season.findFirst({
    where: {
      seasonNum: data.seasonNum,
      regionId: data.regionId,
      formatId: data.formatId,
      NOT: { id },
    },
  });

  if (conflictingSeason) {
    throw new Error(
      `Season ${data.seasonNum} already exists for this region and format`,
    );
  }

  return await prisma.season.update({
    where: { id },
    data: {
      seasonNum: data.seasonNum,
      regionId: data.regionId,
      formatId: data.formatId,
      numWeeks: data.numWeeks,
    },
  });
}

/**
 * Delete a season
 *
 * Business logic validation:
 * - Season must exist
 * - Cannot delete if any dependent records exist (teams, matches, history, playoffs, payments, signups)
 */
export async function deleteSeason(id: number) {
  const season = await prisma.season.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          teams: true,
          matches: true,
          teamsHistory: true,
          playoffs: true,
          paymentTrackers: true,
          activeSignupSeasons: true,
        },
      },
    },
  });

  if (!season) {
    throw new Error('Season not found');
  }

  const blockers: string[] = [];
  if (season._count.teams > 0)
    blockers.push(`${season._count.teams} team${season._count.teams !== 1 ? 's' : ''}`);
  if (season._count.matches > 0)
    blockers.push(`${season._count.matches} match${season._count.matches !== 1 ? 'es' : ''}`);
  if (season._count.teamsHistory > 0)
    blockers.push(`${season._count.teamsHistory} team history record${season._count.teamsHistory !== 1 ? 's' : ''}`);
  if (season._count.playoffs > 0)
    blockers.push('a playoff bracket');
  if (season._count.paymentTrackers > 0)
    blockers.push(`${season._count.paymentTrackers} payment record${season._count.paymentTrackers !== 1 ? 's' : ''}`);
  if (season._count.activeSignupSeasons > 0)
    blockers.push('active signup configuration');

  if (blockers.length > 0) {
    throw new Error(`Cannot delete season: it has ${blockers.join(', ')}.`);
  }

  return await prisma.season.delete({ where: { id } });
}

/**
 * Get seasons for dropdown/filter UI (simplified)
 * Returns id, seasonNum, and region info for disambiguation
 *
 * TODO: TEMPORARY WORKAROUND - Remove region info from filter when schema is refactored
 * Currently seasons have the same seasonNum across different regions (e.g., "Season 1 NA" and "Season 1 EU" both have seasonNum=1)
 * This causes confusion in dropdowns where multiple "Season 1" options appear.
 *
 * FUTURE SCHEMA FIX:
 * - Make season names unique and descriptive (e.g., "Season 1 - NA", "Season 1 - EU")
 * - OR create a proper Season/SeasonInstance relationship where Season is the global concept and SeasonInstance is region-specific
 * - OR add a composite display name field that includes region context
 *
 * Once schema is fixed, this function should return to simple { id, seasonNum } structure
 */
export async function getSeasonsForFilter(limit = 50) {
  return await prisma.season.findMany({
    select: {
      id: true,
      seasonNum: true,
      regionId: true,
      formatId: true,
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ seasonNum: 'desc' }, { regionId: 'asc' }],
    take: limit,
  });
}

/**
 * Transform season data for UI display
 * Calculates status based on teams and matches
 */
export function transformSeasonForUI(
  season: Prisma.SeasonGetPayload<{
    include: {
      region: true;
      format: true;
      _count: {
        select: {
          teams: true;
          matches: true;
        };
      };
    };
  }>,
  isLatest: boolean,
) {
  let status = 'Completed';
  if (isLatest && season._count.teams > 0) {
    status = 'Active';
  } else if (season._count.teams === 0) {
    status = 'Draft';
  }

  return {
    id: season.id,
    seasonNum: season.seasonNum,
    region: season.region.name,
    regionId: season.regionId,
    format: season.format.name,
    formatId: season.formatId,
    numWeeks: season.numWeeks,
    teams: season._count.teams,
    matches: season._count.matches,
    status,
  };
}
