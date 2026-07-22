/**
 * Settings Service
 *
 * All global settings and configuration business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { setActiveSignupSeason } from './signupSeasons';

/**
 * Get global settings
 * There should only be one row in the global table
 */
export async function getGlobalSettings() {
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
  const activeSeasons = await prisma.activeSignupSeason.findMany({
    include: {
      season: {
        select: { signupsOpen: true },
      },
    },
  });

  return activeSeasons.some((as) => as.season.signupsOpen);
}
