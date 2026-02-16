/**
 * Team Signup Service
 * Handles team creation, re-registration, and join token generation
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import jwt from 'jsonwebtoken';
import { error } from '@sveltejs/kit';
import {
  getCurrentSignupSeasonIds,
  getSignupSeasonForRegion,
} from './signupSeasons';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { getJwtSecret } from '$lib/server/utils/env';
import { hashPassword } from '$lib/server/utils/password';

// Token expiry reduced from 7d to 1h for security (shorter exposure window)
const TOKEN_EXPIRY = '1h';

interface SignupContext {
  isLoggedIn: boolean;
  ownedTeams: any[];
  hasActiveTeam: boolean;
  signupClosed: boolean;
  rosterLocked: boolean;
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

/**
 * Get signup context for a user
 * Now uses per-season settings instead of global
 */
export async function getSignupContext(
  steamId: string | null,
): Promise<SignupContext> {
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
  const anySignupsOpen = activeSignupSeasons.some(
    (as) => as.season.signupsOpen,
  );
  // Check if ALL active signup seasons have rosters locked (conservative approach)
  const allRostersLocked =
    activeSignupSeasons.length > 0 &&
    activeSignupSeasons.every((as) => as.season.rosterLocked);

  let ownedTeams: any[] = [];
  let hasActiveTeam = false;

  if (steamId) {
    ownedTeams = await prisma.playerInTeam.findMany({
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

    // Check if user is in any active 2v2 team that's ALREADY in a current signup season
    // This allows users to re-register teams from previous seasons
    const activeTeamMembership = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        team: {
          formatId: FORMAT_2V2,
          seasonId: {
            in:
              currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1], // Use -1 as fallback to match nothing
          },
        },
      },
    });

    hasActiveTeam = !!activeTeamMembership;
  }

  return {
    isLoggedIn: !!steamId,
    ownedTeams: ownedTeams.map((pt) => pt.team),
    hasActiveTeam,
    signupClosed: !anySignupsOpen, // Inverted: signupsOpen=false means signupClosed=true
    rosterLocked: allRostersLocked,
  };
}

/**
 * Validate team creation data
 */
export async function validateTeamCreation(
  data: TeamCreationData,
): Promise<void> {
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
    throw error(400, 'You are already in an active 2v2 team for this season');
  }

  // Validate team name
  if (!data.name || data.name.length > 25) {
    throw error(400, 'Team name must be between 1 and 25 characters');
  }

  if (/<|>/.test(data.name)) {
    throw error(400, 'Team name cannot contain < or > characters');
  }

  // Check for duplicate team name
  const duplicateTeam = await prisma.team.findFirst({
    where: {
      name: data.name,
    },
  });

  if (duplicateTeam) {
    throw error(400, 'A team with this name already exists');
  }

  // Validate acronym if provided
  if (data.acronym && data.acronym.length > 4) {
    throw error(400, 'Team acronym must be 4 characters or less');
  }
}

/**
 * Create a new team
 */
export async function createTeam(data: TeamCreationData): Promise<number> {
  // Validate first
  await validateTeamCreation(data);

  // Get division to determine status
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    throw error(400, 'Invalid division selected');
  }

  // Get the signup season for the region (2v2 format)
  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_2V2);

  if (!seasonId) {
    throw error(400, 'No active signup season for this region');
  }

  // Determine initial status based on division
  // Premier (4) and Intermediate (3) start as PLACEMENT, others as UNREADY
  const initialStatus =
    data.divisionId === 3 || data.divisionId === 4
      ? TeamStatus.PLACEMENT
      : TeamStatus.UNREADY;

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
      paymentStatus: division.signupCost === 0 ? 1 : 0,
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
  const isPaid = division.signupCost === 0 || amountPaid >= division.signupCost;

  // Add owner as player with permissionLevel = 2 (Owner)
  await prisma.playerInTeam.create({
    data: {
      playerSteamId: data.ownerSteamId,
      teamId: team.id,
      permissionLevel: 2,
      paymentStatus: isPaid ? 1 : 0,
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
export async function reregisterTeam(
  data: TeamReregistrationData,
): Promise<void> {
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
    throw error(403, 'You must be the team owner to re-register');
  }

  if (ownership.team.formatId !== FORMAT_2V2) {
    throw error(400, 'Only 2v2 teams can be re-registered on this page');
  }

  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_2V2);

  if (!seasonId) {
    throw error(400, 'No active signup season for this region');
  }

  // Get division info
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    throw error(400, 'Invalid division selected');
  }

  const initialPaymentStatus = division.signupCost === 0 ? 1 : 0;
  const initialStatus =
    data.divisionId === 3 || data.divisionId === 4
      ? TeamStatus.PLACEMENT
      : TeamStatus.UNREADY;

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
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;

    if (decoded.type !== 'team-invite') {
      throw error(400, 'Invalid token type');
    }

    return {
      teamId: decoded.teamId,
      invitedBy: decoded.invitedBy,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw error(400, 'Invitation link has expired');
    }
    throw error(400, 'Invalid invitation link');
  }
}
