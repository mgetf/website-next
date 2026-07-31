/**
 * Settings Service
 *
 * All global settings and configuration business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { setActiveSignupSeason } from './signupSeasons';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createCatalogClient, getRegionIds, getActiveSignupSeason } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason } from '$lib/server/rama/seasons';
import { createTeamsClient, getTeam } from '$lib/server/rama/teams';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';

/**
 * Get global settings
 * There should only be one row in the global table
 */
export async function getGlobalSettings() {
  if (isRamaBackend()) {
    // Soft defaults — no GlobalsModule yet.
    return {
      id: 1,
      leagueFees: 0,
      botTradeOfferUrl: null as string | null,
      botSteamId: null as string | null,
      standingsVisibleStatuses: ['READY', 'PENDING'],
    };
  }
  return await prisma.global.findFirst();
}

/**
 * Update global settings
 * Creates if doesn't exist
 */
export async function updateGlobalSettings(data: {
  leagueFees?: number;
  botTradeOfferUrl?: string | null;
  botSteamId?: string | null;
  standingsVisibleStatuses?: string[];
}) {
  const existingSettings = await prisma.global.findFirst();

  if (existingSettings) {
    return await prisma.global.update({
      where: { id: existingSettings.id },
      data,
    });
  } else {
    return await prisma.global.create({
      data: {
        leagueFees: data.leagueFees ?? 0,
        botTradeOfferUrl: data.botTradeOfferUrl ?? null,
        botSteamId: data.botSteamId ?? null,
        standingsVisibleStatuses: data.standingsVisibleStatuses ?? ['READY', 'PENDING'],
      },
    });
  }
}

/**
 * Update signup season for a region+format combination
 * Uses the ActiveSignupSeason junction table
 */
export async function updateRegionSignupSeason(
  regionId: number,
  formatId: number,
  seasonId: number | null,
) {
  return await setActiveSignupSeason(regionId, formatId, seasonId);
}

// ============================================================================
// PER-SEASON SETTINGS
// These settings are now managed at the season level for better control
// ============================================================================

/**
 * Season settings interface
 */
export interface SeasonSettings {
  signupsOpen: boolean;
  rosterLocked: boolean;
  paymentRequired: boolean;
  matchWeek: number | null;
  matchDeadline: Date | null;
}

/**
 * Update settings for a specific season
 */
export async function updateSeasonSettings(seasonId: number, data: Partial<SeasonSettings>) {
  return await prisma.season.update({
    where: { id: seasonId },
    data,
  });
}

/**
 * Toggle signups open status for a season
 */
export async function toggleSeasonSignupsOpen(seasonId: number) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { signupsOpen: true },
  });

  if (!season) {
    throw new Error('Season not found');
  }

  return await prisma.season.update({
    where: { id: seasonId },
    data: { signupsOpen: !season.signupsOpen },
  });
}

/**
 * Toggle roster locked status for a season
 */
export async function toggleSeasonRosterLocked(seasonId: number) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { rosterLocked: true },
  });

  if (!season) {
    throw new Error('Season not found');
  }

  return await prisma.season.update({
    where: { id: seasonId },
    data: { rosterLocked: !season.rosterLocked },
  });
}

/**
 * Toggle payment required status for a season
 */
export async function toggleSeasonPaymentRequired(seasonId: number) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { paymentRequired: true },
  });

  if (!season) {
    throw new Error('Season not found');
  }

  return await prisma.season.update({
    where: { id: seasonId },
    data: { paymentRequired: !season.paymentRequired },
  });
}

/**
 * Check whether a season is currently active (referenced in ActiveSignupSeason).
 * A season that is not active is considered a past/completed season.
 */
export async function isSeasonCurrentlyActive(seasonId: number): Promise<boolean> {
  if (isRamaBackend()) {
    const catalog = createCatalogClient(ramaClientOpts());
    const regionIds = await getRegionIds(catalog);
    const sid = String(seasonId);
    for (const rid of regionIds) {
      for (const fid of [String(FORMAT_2V2), String(FORMAT_1V1)]) {
        const active = await getActiveSignupSeason(catalog, rid, fid);
        if (active === sid) return true;
      }
    }
    return false;
  }

  const entry = await prisma.activeSignupSeason.findFirst({
    where: { seasonId },
  });
  return entry !== null;
}

/**
 * Check whether a team's season is currently active.
 * Returns false for teams with no season or whose season has ended.
 */
export async function isTeamSeasonActive(teamId: number): Promise<boolean> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { seasonId: true },
  });
  if (!team?.seasonId) return false;
  return isSeasonCurrentlyActive(team.seasonId);
}

/**
 * Determine if roster lock is effectively in force for a given team.
 * Returns true only when the team's season has rosterLocked=true AND that
 * season is still the current active season. Past seasons are never locked.
 */
export async function getEffectiveRosterLock(teamId: number): Promise<boolean> {
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const team = await getTeam(createTeamsClient(opts), String(teamId));
    const seasonId = team?.seasonId;
    if (typeof seasonId !== 'string') return false;
    const season = await getSeason(createSeasonsClient(opts), seasonId);
    if (!season?.rosterLocked) return false;
    return isSeasonCurrentlyActive(Number(seasonId));
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      season: {
        select: {
          id: true,
          rosterLocked: true,
        },
      },
    },
  });

  if (!team?.season?.rosterLocked) return false;
  return isSeasonCurrentlyActive(team.season.id);
}

/**
 * Check if any active signup season has signups open
 * Useful for navigation to determine if signup button should show
 */
export async function hasAnySignupsOpen(): Promise<boolean> {
  if (isRamaBackend()) {
    const { hasAnyOpenSignup } = await import('$lib/server/services/signupSeasons');
    return hasAnyOpenSignup();
  }

  const activeSeasons = await prisma.activeSignupSeason.findMany({
    include: {
      season: {
        select: { signupsOpen: true },
      },
    },
  });

  return activeSeasons.some((as) => as.season.signupsOpen);
}
