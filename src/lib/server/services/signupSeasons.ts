import { prisma } from '$lib/server/db';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createCatalogClient, getActiveSignupSeason, getRegionIds } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason, getSeasonSignupsOpen } from '$lib/server/rama/seasons';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';

// ─── Rama helpers ──────────────────────────────────────────────────────────────

function catalogClient() {
  return createCatalogClient(ramaClientOpts());
}

function seasonsClient() {
  return createSeasonsClient(ramaClientOpts());
}

/**
 * Return all active season IDs for the given format (or all formats) via Rama.
 * Iterates all region IDs from the $$region-ids index, then looks up the active
 * signup pointer from $$active-signup.
 */
async function getCurrentSignupSeasonIdsRama(formatId?: number): Promise<number[]> {
  const catalog = catalogClient();
  const regionIds = await getRegionIds(catalog);

  const formatIds =
    formatId != null ? [String(formatId)] : [String(FORMAT_2V2), String(FORMAT_1V1)];

  const results: number[] = [];
  for (const rid of regionIds) {
    for (const fid of formatIds) {
      const sid = await getActiveSignupSeason(catalog, rid, fid);
      if (sid != null) {
        const num = Number(sid);
        if (!isNaN(num)) results.push(num);
      }
    }
  }
  return results;
}

async function getSignupSeasonForRegionRama(
  regionId: number,
  formatId: number,
): Promise<number | null> {
  const catalog = catalogClient();
  const sid = await getActiveSignupSeason(catalog, String(regionId), String(formatId));
  if (sid == null) return null;
  const num = Number(sid);
  return isNaN(num) ? null : num;
}

async function hasAnyOpenSignupRama(): Promise<boolean> {
  const catalog = catalogClient();
  const seasons = seasonsClient();
  const regionIds = await getRegionIds(catalog);
  for (const rid of regionIds) {
    for (const fid of [String(FORMAT_2V2), String(FORMAT_1V1)]) {
      const sid = await getActiveSignupSeason(catalog, rid, fid);
      if (sid != null) {
        const open = await getSeasonSignupsOpen(seasons, sid);
        if (open) return true;
      }
    }
  }
  return false;
}

async function getActiveFormatCodesRama(): Promise<string[]> {
  const catalog = catalogClient();
  const seasons = seasonsClient();
  const regionIds = await getRegionIds(catalog);
  const codes = new Set<string>();
  const formatMap: Record<string, string> = {
    [String(FORMAT_2V2)]: '2v2',
    [String(FORMAT_1V1)]: '1v1',
  };
  for (const rid of regionIds) {
    for (const [fid, code] of Object.entries(formatMap)) {
      const sid = await getActiveSignupSeason(catalog, rid, fid);
      if (sid != null) {
        const rec = await getSeason(seasons, sid);
        if (rec?.signupsOpen) codes.add(code);
      }
    }
  }
  return [...codes];
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all current signup season IDs, optionally filtered by format
 * @param formatId - Optional format ID to filter by (1 = 1v1, 2 = 2v2)
 * @returns Array of season IDs that are currently open for signups
 */
export async function getCurrentSignupSeasonIds(formatId?: number): Promise<number[]> {
  if (isRamaBackend()) return getCurrentSignupSeasonIdsRama(formatId);

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
  if (isRamaBackend()) return getSignupSeasonForRegionRama(regionId, formatId);

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
  if (isRamaBackend()) return hasAnyOpenSignupRama();

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
  if (isRamaBackend()) return getActiveFormatCodesRama();

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
