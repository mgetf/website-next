/**
 * Team Signup Service
 * Handles team creation, re-registration, and join token generation
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import type { Prisma } from '$prisma/client.js';
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

type OwnedTeamMembership = Prisma.PlayerInTeamGetPayload<{
  include: {
    team: {
      include: {
        division: true;
        region: true;
        season: true;
      };
    };
  };
}>;

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

  // Get current signup season IDs for 2v2 format
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);

  // Get active signup seasons with their settings
  const activeSignupSeasons = await prisma.activeSignupSeason.findMany({
    where: {
      formatId: FORMAT_2V2,
    },
    include: {
      season: {
        select: {
          signupsOpen: true,
          rosterLocked: true,
        },
      },
    },
  });

  // Check if ANY active signup season has signups open
  const anySignupsOpen = activeSignupSeasons.some((as) => as.season.signupsOpen);
  // Check if ALL active signup seasons have rosters locked (conservative approach)
  const allRostersLocked =
    activeSignupSeasons.length > 0 && activeSignupSeasons.every((as) => as.season.rosterLocked);

  let ownedTeams: OwnedTeam[] = [];
  let hasActiveTeam = false;

  if (steamId) {
    const ownedMemberships = await prisma.playerInTeam.findMany({
      where: {
        playerSteamId: steamId,
        permissionLevel: 2,
        active: 1,
        team: {
          formatId: FORMAT_2V2,
        },
      },
      include: {
        team: {
          include: {
            division: true,
            region: true,
            season: true,
          },
        },
      },
    });
    ownedTeams = ownedMemberships.map((membership) => membership.team);

    // Check if user is in any active 2v2 team that's ALREADY in a current signup season
    // This allows users to re-register teams from previous seasons
    const activeTeamMembership = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        team: {
          formatId: FORMAT_2V2,
          seasonId: {
            in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1], // Use -1 as fallback to match nothing
          },
        },
      },
    });

    hasActiveTeam = !!activeTeamMembership;
  }

  // Find active memberships on old-season teams that would be auto-removed on signup.
  // Only relevant when the user can actually proceed (no current-season team blocking them).
  let previousSeasonTeams: { id: number; name: string }[] = [];
  if (steamId && !hasActiveTeam) {
    const oldMemberships = await prisma.playerInTeam.findMany({
      where: {
        playerSteamId: steamId,
        active: 1,
        team: {
          formatId: FORMAT_2V2,
          seasonId: {
            notIn: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1],
          },
        },
      },
      include: { team: { select: { id: true, name: true } } },
    });
    previousSeasonTeams = oldMemberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
    }));
  }

  return {
    isLoggedIn: !!steamId,
    ownedTeams,
    hasActiveTeam,
    signupClosed: !anySignupsOpen, // Inverted: signupsOpen=false means signupClosed=true
    rosterLocked: allRostersLocked,
    previousSeasonTeams,
  };
}

/**
 * Validate team creation data
 */
export async function validateTeamCreation(data: TeamCreationData): Promise<void> {
  if (isRamaBackend()) {
    await validateTeamCreationRama(data);
    return;
  }

  // Get current signup season IDs for 2v2 format
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);

  // Check if user is already in an active 2v2 team for a CURRENT signup season
  // Users can create new teams if their old team is from a previous season
  const existingTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: data.ownerSteamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: {
          in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1],
        },
      },
    },
  });

  if (existingTeam) {
    badRequest('You are already in an active 2v2 team for this season');
  }

  // Validate team name
  if (!data.name || data.name.length > 25) {
    badRequest('Team name must be between 1 and 25 characters');
  }

  if (/<|>/.test(data.name)) {
    badRequest('Team name cannot contain < or > characters');
  }

  // Check for duplicate team name
  const duplicateTeam = await prisma.team.findFirst({
    where: {
      name: data.name,
    },
  });

  if (duplicateTeam) {
    badRequest('A team with this name already exists');
  }

  // Validate acronym if provided
  if (data.acronym && data.acronym.length > 4) {
    badRequest('Team acronym must be 4 characters or less');
  }
}

/**
 * Create a new team
 */
export async function createTeam(data: TeamCreationData): Promise<number> {
  if (isRamaBackend()) return createTeamRama(data);

  // Validate first
  await validateTeamCreation(data);

  // Get division to determine status
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    badRequest('Invalid division selected');
  }

  // Get the signup season for the region (2v2 format)
  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_2V2);

  if (!seasonId) {
    badRequest('No active signup season for this region');
  }

  const initialStatus = TeamStatus.UNREADY;

  // Hash the join password for secure storage
  const hashedPassword = await hashPassword(data.joinPassword);

  // Create team
  const team = await prisma.team.create({
    data: {
      name: data.name,
      acronym: data.acronym,
      avatar: data.avatar,
      divisionId: data.divisionId,
      regionId: data.regionId,
      seasonId: seasonId,
      formatId: FORMAT_2V2,
      status: initialStatus,
      joinPassword: hashedPassword,
      paymentStatus: division.signupCost === 0 ? 2 : 0,
    },
  });

  // Check if user has already paid
  const existingPayment = await prisma.paymentTracker.findUnique({
    where: {
      playerSteamId_seasonId: {
        playerSteamId: data.ownerSteamId,
        seasonId: seasonId,
      },
    },
  });

  const amountPaid = existingPayment?.amount || 0;
  const playerPaymentStatus =
    division.signupCost === 0 ? 2 : amountPaid >= division.signupCost ? 1 : 0;

  // Deactivate any stale memberships on other 2v2 teams from previous seasons
  // before adding the owner to the new team
  await prisma.playerInTeam.updateMany({
    where: {
      playerSteamId: data.ownerSteamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: { not: seasonId },
      },
    },
    data: {
      active: 0,
      leftAt: new Date(),
    },
  });

  // Add owner as player with permissionLevel = 2 (Owner)
  await prisma.playerInTeam.create({
    data: {
      playerSteamId: data.ownerSteamId,
      teamId: team.id,
      permissionLevel: 2,
      paymentStatus: playerPaymentStatus,
      active: 1,
    },
  });

  // Note: We don't create a teamNameHistory record on initial creation
  // History records are only created when a team name is CHANGED

  return team.id;
}

/**
 * Re-register an existing team for a new season
 */
export async function reregisterTeam(data: TeamReregistrationData): Promise<void> {
  const ownership = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId: data.ownerSteamId,
        teamId: data.teamId,
      },
    },
    include: {
      team: {
        select: { formatId: true },
      },
    },
  });

  if (!ownership || ownership.permissionLevel !== 2) {
    forbidden('You must be the team owner to re-register');
  }

  if (ownership.team.formatId !== FORMAT_2V2) {
    badRequest('Only 2v2 teams can be re-registered on this page');
  }

  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_2V2);

  if (!seasonId) {
    badRequest('No active signup season for this region');
  }

  // Get division info
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    badRequest('Invalid division selected');
  }

  const initialPaymentStatus = division.signupCost === 0 ? 2 : 0;
  const initialStatus = TeamStatus.UNREADY;

  // Deactivate any stale memberships on other 2v2 teams from previous seasons
  await prisma.playerInTeam.updateMany({
    where: {
      playerSteamId: data.ownerSteamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        id: { not: data.teamId },
        seasonId: { not: seasonId },
      },
    },
    data: {
      active: 0,
      leftAt: new Date(),
    },
  });

  // Update team with new season/division/region and reset stats
  await prisma.team.update({
    where: { id: data.teamId },
    data: {
      seasonId: seasonId,
      regionId: data.regionId,
      divisionId: data.divisionId,
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsScored: 0,
      pointsScoredAgainst: 0,
    },
  });

  // Update payment status for all active players
  await prisma.playerInTeam.updateMany({
    where: {
      teamId: data.teamId,
      active: 1,
    },
    data: {
      paymentStatus: initialPaymentStatus,
    },
  });
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
