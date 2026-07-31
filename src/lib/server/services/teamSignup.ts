/**
 * Team Signup Service
 * Handles team creation, re-registration, and join token generation
 */

import jwt from 'jsonwebtoken';
import { badRequest, forbidden } from '$lib/server/utils/errors';
import { getCurrentSignupSeasonIds, getSignupSeasonForRegion } from './signupSeasons';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { getJwtSecret } from '$lib/server/utils/env';
import { hashPassword } from '$lib/server/utils/password';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createCatalogClient, getActiveSignupSeason, getRegionIds } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason } from '$lib/server/rama/seasons';
import {
  createTeam as ramaCreateTeam,
  createTeamsClient,
  getPlayerSeasonTeam,
} from '$lib/server/rama/teams';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';

// Token expiry reduced from 7d to 1h for security (shorter exposure window)
const TOKEN_EXPIRY = '1h';

type OwnedTeamMembership = any;

type OwnedTeam = OwnedTeamMembership['team'];

interface SignupContext {
  isLoggedIn: boolean;
  ownedTeams: OwnedTeam[];
  hasActiveTeam: boolean;
  signupClosed: boolean;
  rosterLocked: boolean;
  previousSeasonTeams: { id: number; name: string }[];
}

interface TeamCreationData {
  name: string;
  acronym?: string;
  avatar?: string;
  divisionId: number;
  regionId: number;
  joinPassword: string;
  ownerSteamId: string;
}

interface TeamReregistrationData {
  teamId: number;
  divisionId: number;
  regionId: number;
  ownerSteamId: string;
}

// ─── Rama helpers ──────────────────────────────────────────────────────────────

async function getSignupContextRama(steamId: string | null): Promise<SignupContext> {
  const opts = ramaClientOpts();
  const catalog = createCatalogClient(opts);
  const seasons = createSeasonsClient(opts);
  const teams = createTeamsClient(opts);

  const regionIds = await getRegionIds(catalog);
  const formatId = String(FORMAT_2V2);

  const activeSeasonIds: string[] = [];
  for (const rid of regionIds) {
    const sid = await getActiveSignupSeason(catalog, rid, formatId);
    if (sid != null) activeSeasonIds.push(sid);
  }

  const seasonRecords = await Promise.all(activeSeasonIds.map((sid) => getSeason(seasons, sid)));

  const anySignupsOpen = seasonRecords.some((r) => r?.signupsOpen);
  const allRostersLocked = seasonRecords.length > 0 && seasonRecords.every((r) => r?.rosterLocked);

  let hasActiveTeam = false;
  if (steamId) {
    for (const sid of activeSeasonIds) {
      const teamId = await getPlayerSeasonTeam(teams, steamId, sid);
      if (teamId) {
        hasActiveTeam = true;
        break;
      }
    }
  }

  return {
    isLoggedIn: !!steamId,
    ownedTeams: [], // name index not available in Rama
    hasActiveTeam,
    signupClosed: !anySignupsOpen,
    rosterLocked: allRostersLocked,
    previousSeasonTeams: [], // old-season scan not available in Rama
  };
}

async function validateTeamCreationRama(data: TeamCreationData): Promise<void> {
  const opts = ramaClientOpts();
  const catalog = createCatalogClient(opts);
  const seasons = createSeasonsClient(opts);
  const teams = createTeamsClient(opts);

  const regionIds = await getRegionIds(catalog);
  const formatId = String(FORMAT_2V2);

  const activeSeasonIds: string[] = [];
  for (const rid of regionIds) {
    const sid = await getActiveSignupSeason(catalog, rid, formatId);
    if (sid != null) activeSeasonIds.push(sid);
  }

  for (const sid of activeSeasonIds) {
    const existing = await getPlayerSeasonTeam(teams, data.ownerSteamId, sid);
    if (existing) {
      badRequest('You are already in an active 2v2 team for this season');
    }
  }

  // Name length / content validation (no name-uniqueness check — no index in Rama)
  if (!data.name || data.name.length > 25) {
    badRequest('Team name must be between 1 and 25 characters');
  }

  if (/<|>/.test(data.name)) {
    badRequest('Team name cannot contain < or > characters');
  }

  if (data.acronym && data.acronym.length > 4) {
    badRequest('Team acronym must be 4 characters or less');
  }
}

async function createTeamRama(data: TeamCreationData): Promise<number> {
  await validateTeamCreationRama(data);

  const opts = ramaClientOpts();
  const divisionsClient = createDivisionsClient(opts);
  const division = await getDivision(divisionsClient, String(data.divisionId));

  if (!division) {
    badRequest('Invalid division selected');
  }

  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_2V2);
  if (!seasonId) {
    badRequest('No active signup season for this region');
  }

  // Generate a numeric team ID (same approach as E2E seed helpers)
  const teamId = Date.now() % 2_000_000_000;

  const hashedPassword = await hashPassword(data.joinPassword);
  const teamsClient = createTeamsClient(opts);
  const ack = await ramaCreateTeam(teamsClient, {
    teamId: String(teamId),
    steamId: data.ownerSteamId,
    name: data.name,
    acronym: data.acronym ?? '',
    formatId: String(FORMAT_2V2),
    seasonId: String(seasonId),
    divisionId: String(data.divisionId),
    regionId: String(data.regionId),
    joinPassword: hashedPassword,
  });

  if (!ack.ok) {
    badRequest(ack.error ?? 'Failed to create team');
  }

  return teamId;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get signup context for a user
 * Now uses per-season settings instead of global
 */
export async function getSignupContext(steamId: string | null): Promise<SignupContext> {
  if (isRamaBackend()) return getSignupContextRama(steamId);
  throw new Error('getSignupContext requires DATA_BACKEND=rama');
}

/**
 * Validate team creation data
 */
/** @lintignore Soft-stub / cutover API surface */
export async function validateTeamCreation(data: TeamCreationData): Promise<void> {
  if (isRamaBackend()) {
    await validateTeamCreationRama(data);
    return;
  }
  throw new Error('validateTeamCreation requires DATA_BACKEND=rama');
}

/**
 * Create a new team
 */
export async function createTeam(data: TeamCreationData): Promise<number> {
  if (isRamaBackend()) return createTeamRama(data);
  throw new Error('createTeam requires DATA_BACKEND=rama');
}

/**
 * Re-register an existing team for a new season
 */
export async function reregisterTeam(data: TeamReregistrationData): Promise<void> {
  throw new Error('reregisterTeam is not available under Rama');
}

/**
 * Generate a secure JWT token for team joining
 */
export function generateJoinToken(teamId: number, invitedBy?: string): string {
  const payload = {
    teamId,
    invitedBy: invitedBy || 'team',
    type: 'team-invite',
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Validate and decode a join token
 */
export function validateJoinToken(token: string): {
  teamId: number;
  invitedBy: string;
} {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      badRequest('Invitation link has expired');
    }
    badRequest('Invalid invitation link');
  }

  if (typeof decoded !== 'object' || decoded === null) {
    badRequest('Invalid invitation link');
  }

  const payload = decoded as {
    type?: unknown;
    teamId?: unknown;
    invitedBy?: unknown;
  };

  if (payload.type !== 'team-invite') {
    badRequest('Invalid token type');
  }

  if (typeof payload.teamId !== 'number' || typeof payload.invitedBy !== 'string') {
    badRequest('Invalid invitation link');
  }

  return {
    teamId: payload.teamId,
    invitedBy: payload.invitedBy,
  };
}
