import { prisma } from '$lib/server/db';

/**
 * Get all current signup season IDs, optionally filtered by format
 * @param formatId - Optional format ID to filter by (1 = 1v1, 2 = 2v2)
 * @returns Array of season IDs that are currently open for signups
 */
export async function getCurrentSignupSeasonIds(
  formatId?: number,
): Promise<number[]> {
  const activeSignups = await prisma.activeSignupSeason.findMany({
    where: formatId ? { formatId } : undefined,
  });
  return activeSignups.map((a) => a.seasonId);
}

/**
 * Get the current signup season for a specific region and format
 * @param regionId - Region ID (1=NA, 2=EU, 3=AUS, 4=SA, 5=ASIA)
 * @param formatId - Format ID (1=1v1, 2=2v2)
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
 * Check whether any active signup season has signups currently open
 */
export async function hasAnyOpenSignup(): Promise<boolean> {
  const result = await prisma.activeSignupSeason.findFirst({
    where: {
      season: { signupsOpen: true },
    },
  });
  return result !== null;
}

/**
 * Get the format codes of all active signup seasons
 * Used to determine which format tabs to show on the signup page
 */
export async function getActiveFormatCodes(): Promise<string[]> {
  const activeFormats = await prisma.activeSignupSeason.findMany({
    select: {
      formatId: true,
      format: { select: { code: true } },
    },
    distinct: ['formatId'],
  });
  return activeFormats.map((f) => f.format.code);
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
