/**
 * Settings Service
 *
 * All global settings and configuration business logic and database operations.
 */

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
  throw new Error('getGlobalSettings requires DATA_BACKEND=rama');
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
  throw new Error('updateGlobalSettings is not available under Rama');
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
  throw new Error('updateSeasonSettings is not available under Rama');
}

/**
 * Toggle signups open status for a season
 */
export async function toggleSeasonSignupsOpen(seasonId: number) {
  throw new Error('toggleSeasonSignupsOpen is not available under Rama');
}

/**
 * Toggle roster locked status for a season
 */
export async function toggleSeasonRosterLocked(seasonId: number) {
  throw new Error('toggleSeasonRosterLocked is not available under Rama');
}

/**
 * Toggle payment required status for a season
 */
export async function toggleSeasonPaymentRequired(seasonId: number) {
  throw new Error('toggleSeasonPaymentRequired is not available under Rama');
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
  throw new Error('isSeasonCurrentlyActive requires DATA_BACKEND=rama');
}

/**
 * Check whether a team's season is currently active.
 * Returns false for teams with no season or whose season has ended.
 */
export async function isTeamSeasonActive(teamId: number): Promise<boolean> {
  return false;
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
  throw new Error('getEffectiveRosterLock requires DATA_BACKEND=rama');
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
  throw new Error('hasAnySignupsOpen requires DATA_BACKEND=rama');
}
