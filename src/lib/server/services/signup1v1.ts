/**
 * 1v1 League Signup Service
 * Handles individual player signup for 1v1 leagues using 1-person teams
 * The team abstraction is completely hidden from users
 *
 * 1v1 Status Model
 * ================
 * 1v1 entries use the same lifecycle as 2v2:
 * - UNREADY: Signed up, not yet readied
 * - PENDING: Player toggled ready, awaiting admin approval
 * - READY:   Admin approved, active for the season
 * - DEAD:    Withdrawn
 *
 * "Active" (not withdrawn) means status !== DEAD.
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import { badRequest, forbidden, notFound } from '$lib/server/utils/errors';
import { getCurrentSignupSeasonIds, getSignupSeasonForRegion } from './signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { disbandTeam } from './teamManagement';

const ACTIVE_1V1_STATUSES: TeamStatus[] = [
  TeamStatus.UNREADY,
  TeamStatus.PENDING,
  TeamStatus.READY,
];

/**
 * Check if a user has an active 1v1 entry in any current signup season.
 * "Active" means any status that isn't DEAD.
 */
export async function hasActive1v1Entry(steamId: string): Promise<boolean> {
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

  if (currentSignupSeasonIds.length === 0) {
    return false;
  }

  const existing = await prisma.team.findFirst({
    where: {
      formatId: FORMAT_1V1,
      status: { in: ACTIVE_1V1_STATUSES },
      seasonId: { in: currentSignupSeasonIds },
      players: {
        some: { playerSteamId: steamId },
      },
    },
  });

  return !!existing;
}

/**
 * Get the active 1v1 entry for a user in current signup seasons
 * Returns null if no active entry exists
 */
export async function getActive1v1Entry(steamId: string) {
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

  if (currentSignupSeasonIds.length === 0) {
    return null;
  }

  return await prisma.team.findFirst({
    where: {
      formatId: FORMAT_1V1,
      status: { in: ACTIVE_1V1_STATUSES },
      seasonId: { in: currentSignupSeasonIds },
      players: {
        some: { playerSteamId: steamId },
      },
    },
    include: {
      division: true,
      region: true,
      season: true,
    },
  });
}

interface Signup1v1Context {
  isLoggedIn: boolean;
  hasActive1v1Entry: boolean;
  signupClosed: boolean;
  user: {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
  } | null;
}

interface Signup1v1Data {
  ownerSteamId: string;
  regionId: number;
  divisionId: number;
}

/**
 * Get 1v1 signup context for a user
 * Now uses per-season settings instead of global
 */
export async function get1v1SignupContext(steamId: string | null): Promise<Signup1v1Context> {
  // Get current signup season IDs for 1v1 format
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

  // Get active signup seasons with their settings for 1v1 format
  const activeSignupSeasons = await prisma.activeSignupSeason.findMany({
    where: {
      formatId: FORMAT_1V1,
    },
    include: {
      season: {
        select: {
          signupsOpen: true,
        },
      },
    },
  });

  // Check if ANY active 1v1 signup season has signups open
  const anySignupsOpen = activeSignupSeasons.some((as) => as.season.signupsOpen);

  let hasActive1v1Entry = false;
  let user = null;

  if (steamId) {
    // Get user info
    const userData = await prisma.user.findUnique({
      where: { steamId },
      select: {
        steamId: true,
        steamUsername: true,
        steamAvatar: true,
      },
    });

    user = userData;

    const existing1v1Entry = await prisma.team.findFirst({
      where: {
        formatId: FORMAT_1V1,
        status: { in: ACTIVE_1V1_STATUSES },
        seasonId: {
          in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1],
        },
        players: {
          some: {
            playerSteamId: steamId,
          },
        },
      },
    });

    hasActive1v1Entry = !!existing1v1Entry;
  }

  return {
    isLoggedIn: !!steamId,
    hasActive1v1Entry,
    signupClosed: !anySignupsOpen, // Inverted: signupsOpen=false means signupClosed=true
    user,
  };
}

/**
 * Validate 1v1 signup data
 */
export async function validate1v1Signup(data: Signup1v1Data): Promise<void> {
  // Get current signup season IDs for 1v1 format
  const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

  const existing1v1Entry = await prisma.team.findFirst({
    where: {
      formatId: FORMAT_1V1,
      status: { in: ACTIVE_1V1_STATUSES },
      seasonId: {
        in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1],
      },
      players: {
        some: {
          playerSteamId: data.ownerSteamId,
        },
      },
    },
  });

  if (existing1v1Entry) {
    badRequest('You are already signed up for the 1v1 league this season');
  }

  // Validate division exists
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    badRequest('Invalid division selected');
  }

  // Validate region exists
  const region = await prisma.region.findUnique({
    where: { id: data.regionId },
  });

  if (!region) {
    badRequest('Invalid region selected');
  }

  // Check if there's an active signup season for this region + 1v1 format
  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);

  if (!seasonId) {
    badRequest('No active 1v1 signup season for this region');
  }
}

/**
 * Sign up a player for the 1v1 league
 * If the player previously withdrew from the same region+division, reactivates that entry.
 * Otherwise creates a new 1-person "team" with the player's Steam name and avatar frozen at signup time.
 */
export async function signup1v1(data: Signup1v1Data): Promise<number> {
  // Validate first
  await validate1v1Signup(data);

  // Get user info for freezing name/avatar
  const user = await prisma.user.findUnique({
    where: { steamId: data.ownerSteamId },
    select: {
      steamId: true,
      steamUsername: true,
      steamAvatar: true,
    },
  });

  if (!user) {
    badRequest('User not found');
  }

  // Get division to determine status and cost
  const division = await prisma.division.findUnique({
    where: { id: data.divisionId },
  });

  if (!division) {
    badRequest('Invalid division selected');
  }

  // Get the signup season for this region + 1v1 format
  const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);

  if (!seasonId) {
    badRequest('No active 1v1 signup season for this region');
  }

  // Check if user has a previously withdrawn (DEAD) entry for this exact season+division
  // If so, reactivate it instead of creating a duplicate
  const existingDeadEntry = await prisma.team.findFirst({
    where: {
      formatId: FORMAT_1V1,
      seasonId: seasonId,
      divisionId: data.divisionId,
      status: 'DEAD',
      players: {
        some: {
          playerSteamId: data.ownerSteamId,
        },
      },
    },
    include: {
      players: {
        where: { playerSteamId: data.ownerSteamId },
      },
    },
  });

  if (existingDeadEntry) {
    const initialStatus = TeamStatus.UNREADY;

    // Check payment status
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

    await prisma.team.update({
      where: { id: existingDeadEntry.id },
      data: {
        status: initialStatus,
        // Update name/avatar to current values
        name: user.steamUsername,
        avatar: user.steamAvatar,
      },
    });

    // Reactivate the player in the team
    if (existingDeadEntry.players.length > 0) {
      await prisma.playerInTeam.update({
        where: {
          playerSteamId_teamId: {
            playerSteamId: data.ownerSteamId,
            teamId: existingDeadEntry.id,
          },
        },
        data: {
          active: 1,
          permissionLevel: 2, // Owner
          paymentStatus: isPaid ? 1 : 0,
          leftAt: null,
          startedAt: new Date(),
        },
      });
    }

    return existingDeadEntry.id;
  }

  const initialStatus = TeamStatus.UNREADY;

  // Create 1-person "team" with player's frozen name/avatar
  // No acronym, no join password (nobody can join a 1v1 entry)
  const team = await prisma.team.create({
    data: {
      name: user.steamUsername, // Frozen at signup time
      avatar: user.steamAvatar, // Frozen at signup time
      acronym: null,
      joinPassword: null, // No password - 1v1 entries can't be joined
      divisionId: data.divisionId,
      regionId: data.regionId,
      seasonId: seasonId,
      formatId: FORMAT_1V1,
      status: initialStatus,
      paymentStatus: division.signupCost === 0 ? 1 : 0,
    },
  });

  // Check if user has already paid for this season
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

  // Add player as sole owner (permissionLevel = 2)
  await prisma.playerInTeam.create({
    data: {
      playerSteamId: data.ownerSteamId,
      teamId: team.id,
      permissionLevel: 2, // Owner
      paymentStatus: isPaid ? 1 : 0,
      active: 1,
    },
  });

  return team.id;
}

/**
 * Get a user's active 1v1 entry (if any)
 * Used for profile display and navigation
 */
export async function getUserActive1v1Entry(steamId: string) {
  const currentSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

  // First try current signup seasons
  if (currentSeasonIds.length > 0) {
    const currentEntry = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        team: {
          formatId: FORMAT_1V1,
          seasonId: {
            in: currentSeasonIds,
          },
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

    if (currentEntry) {
      return currentEntry.team;
    }
  }

  // Fall back to any active 1v1 entry
  const anyEntry = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_1V1,
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
    orderBy: {
      startedAt: 'desc',
    },
  });

  return anyEntry?.team || null;
}

/**
 * Get all 1v1 entries for a user (current and past)
 * Used for player profile history
 */
export async function getUser1v1History(steamId: string) {
  const entries = await prisma.playerInTeam.findMany({
    where: {
      playerSteamId: steamId,
      team: {
        formatId: FORMAT_1V1,
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
    orderBy: {
      startedAt: 'desc',
    },
  });

  return entries.map((e) => e.team);
}

/**
 * Toggle a 1v1 entry from UNREADY to PENDING.
 * Requires the player to be paid (for paid divisions).
 */
export async function toggle1v1Ready(teamId: number, requestingSteamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: { select: { signupCost: true } },
      players: {
        where: { active: 1 },
        select: { playerSteamId: true, paymentStatus: true, permissionLevel: true },
      },
    },
  });

  if (!team) notFound('1v1 entry not found');
  if (team.formatId !== FORMAT_1V1) badRequest('This is not a 1v1 entry');

  const player = team.players.find((p) => p.playerSteamId === requestingSteamId);
  if (!player || player.permissionLevel < 2) {
    forbidden('You can only ready up your own 1v1 entry');
  }

  if (team.status !== TeamStatus.UNREADY) {
    badRequest('Entry must be in UNREADY status to ready up');
  }

  const isFreeDiv = !team.division || team.division.signupCost === 0;
  if (!isFreeDiv && player.paymentStatus !== 1) {
    badRequest('You must be paid before readying up');
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { status: TeamStatus.PENDING },
  });
}

/**
 * Withdraw a player from a 1v1 league entry
 * Only the player themselves or an admin can withdraw
 */
export async function withdraw1v1Entry(
  teamId: number,
  requestingSteamId: string,
  isAdmin: boolean,
): Promise<void> {
  // Get the team and verify it's a 1v1 entry
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        where: { active: 1 },
        select: {
          playerSteamId: true,
          permissionLevel: true,
        },
      },
    },
  });

  if (!team) {
    notFound('1v1 entry not found');
  }

  if (team.formatId !== FORMAT_1V1) {
    badRequest('This is not a 1v1 entry');
  }

  if (team.status === 'DEAD') {
    badRequest('This 1v1 entry has already been withdrawn');
  }

  // If not admin, verify the requesting user is the owner
  if (!isAdmin) {
    const isOwner = team.players.some(
      (p) => p.playerSteamId === requestingSteamId && p.permissionLevel === 2,
    );

    if (!isOwner) {
      forbidden('You can only withdraw from your own 1v1 entry');
    }
  }

  // Use the existing disbandTeam function to handle the withdrawal
  await disbandTeam(teamId);
}

/**
 * Restore a withdrawn 1v1 entry (admin only)
 * Sets team status back to READY and reactivates the player
 */
export async function restore1v1Entry(teamId: number): Promise<void> {
  // Get the team and verify it's a 1v1 entry
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        select: {
          playerSteamId: true,
        },
      },
    },
  });

  if (!team) {
    notFound('1v1 entry not found');
  }

  if (team.formatId !== FORMAT_1V1) {
    badRequest('This is not a 1v1 entry');
  }

  if (team.status !== 'DEAD') {
    badRequest('This 1v1 entry is not withdrawn');
  }

  // Update team status to READY (the only active state for 1v1)
  await prisma.team.update({
    where: { id: teamId },
    data: {
      status: TeamStatus.READY,
    },
  });

  // Reactivate the player in the team
  if (team.players.length > 0) {
    await prisma.playerInTeam.updateMany({
      where: {
        teamId: teamId,
      },
      data: {
        active: 1,
        leftAt: null,
      },
    });
  }
}
