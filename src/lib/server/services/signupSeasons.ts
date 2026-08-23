import { prisma } from '$lib/server/db';

/**
 * Get all current signup season IDs, optionally filtered by format
 * @param formatId - Optional format ID to filter by
 * @returns Array of season IDs that are currently open for signups
 */
export async function getCurrentSignupSeasonIds(formatId?: number): Promise<number[]> {
  const activeSignups = await prisma.activeSignupSeason.findMany({
    where: formatId ? { formatId } : undefined,
  });
  return activeSignups.map((a) => a.seasonId);
}

/**
 * Get the current signup season for a specific region and format
 * @param regionId - Region ID (1=NA, 2=EU, 3=AUS, 4=SA, 5=ASIA)
 * @param formatId - Format ID
 * @returns Season ID if found, null otherwise
 */
export async function getSignupSeasonForRegion(
  regionId: number,
  formatId: number,
): Promise<number | null> {
  const active = await prisma.activeSignupSeason.findUnique({
    where: { regionId_formatId: { regionId, formatId } },
  });
  return active?.seasonId ?? null;
}

/**
 * Get all active signup seasons with their region and format details
 * Useful for admin panel display
 */
export async function getAllActiveSignupSeasons() {
  return prisma.activeSignupSeason.findMany({
    include: {
      region: true,
      format: true,
      season: {
        include: {
          _count: {
            select: {
              teams: true,
              matches: true,
            },
          },
        },
      },
    },
    orderBy: [{ regionId: 'asc' }, { formatId: 'asc' }],
  });
}

/**
 * Formats that currently have at least one active signup season with signups open.
 * Used by the signup hub to render one card per open format.
 */
export async function getOpenSignupFormats() {
  const rows = await prisma.activeSignupSeason.findMany({
    where: { season: { signupsOpen: true } },
    select: {
      formatId: true,
      format: {
        select: {
          id: true,
          name: true,
          code: true,
          isIndividual: true,
          supportsReregistration: true,
          themeKey: true,
        },
      },
    },
    distinct: ['formatId'],
    orderBy: { formatId: 'asc' },
  });

  return rows.map((row) => row.format);
}

export async function hasAnyOpenSignup(): Promise<boolean> {
  const result = await prisma.activeSignupSeason.findFirst({
    where: { season: { signupsOpen: true } },
  });
  return result !== null;
}

/** Visible regions with an open, unlocked signup season for this format. */
export async function getRegionsOpenForSignup(formatId: number) {
  const rows = await prisma.activeSignupSeason.findMany({
    where: {
      formatId,
      season: { signupsOpen: true, rosterLocked: false },
      region: { hidden: 0 },
    },
    include: {
      region: {
        select: {
          id: true,
          name: true,
          currencySymbol: true,
          currencyCode: true,
        },
      },
    },
    orderBy: { regionId: 'asc' },
  });

  const seen = new Set<number>();
  const regions: {
    id: number;
    name: string;
    currencySymbol: string;
    currencyCode: string;
  }[] = [];
  for (const row of rows) {
    if (seen.has(row.region.id)) continue;
    seen.add(row.region.id);
    regions.push(row.region);
  }
  return regions;
}

/**
 * Get all active signup seasons including per-season deadline fields
 * Used for the admin dashboard urgency display
 */
export async function getActiveSignupSeasonsWithDeadlines() {
  return prisma.activeSignupSeason.findMany({
    include: {
      season: {
        select: {
          matchWeek: true,
          matchDeadline: true,
        },
      },
    },
  });
}

/**
 * Set the active signup season for a region+format combination
 * @param regionId - Region ID
 * @param formatId - Format ID
 * @param seasonId - Season ID to set, or null to clear
 */
export async function setActiveSignupSeason(
  regionId: number,
  formatId: number,
  seasonId: number | null,
): Promise<void> {
  if (seasonId === null) {
    await prisma.activeSignupSeason.deleteMany({
      where: { regionId, formatId },
    });
  } else {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { formatId: true },
    });

    if (!season) {
      throw new Error(`Season ${seasonId} not found`);
    }

    if (season.formatId !== formatId) {
      throw new Error(
        `Season ${seasonId} belongs to format ${season.formatId}, cannot assign to format ${formatId}`,
      );
    }

    await prisma.activeSignupSeason.upsert({
      where: { regionId_formatId: { regionId, formatId } },
      create: { regionId, formatId, seasonId },
      update: { seasonId },
    });
  }
}
