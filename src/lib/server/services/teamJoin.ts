/**
 * Team Join Service
 * Handles team joining via token and password
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { validateJoinToken } from './teamSignup';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { isSeasonCurrentlyActive } from './settings';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import { verifyPassword } from '$lib/server/utils/password';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  acceptInvite as ramaAcceptInvite,
  createTeamsClient,
  getTeam,
  getRoster,
  getRosterMember,
  getPlayerSeasonTeam,
  getPendingStatus,
  getPendingByPlayer,
  requestJoin,
} from '$lib/server/rama/teams';
import { createUsersClient, getUser } from '$lib/server/rama/users';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';
import { createCatalogClient, getRegion } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason } from '$lib/server/rama/seasons';

type TeamJoinTeam = Prisma.TeamGetPayload<{
  include: {
    division: true;
    region: true;
    season: true;
    players: {
      include: {
        player: true;
      };
    };
  };
}>;

interface TeamJoinInfo {
  team: TeamJoinTeam;
  activePlayers: TeamJoinTeam['players'];
  canJoin: boolean;
  error?: string;
}

/**
 * Validate join token and get team info
 */
async function loadTeamJoinTeamRama(teamId: number): Promise<TeamJoinTeam | null> {
  const opts = ramaClientOpts();
  const teamsClient = createTeamsClient(opts);
  const row = await getTeam(teamsClient, String(teamId));
  if (!row) return null;

  const roster = await getRoster(teamsClient, String(teamId));
  const usersClient = createUsersClient(opts);
  const players = [];
  for (const [memberSteamId, member] of Object.entries(roster)) {
    if (!member.active) continue;
    const user = await getUser(usersClient, memberSteamId);
    players.push({
      playerSteamId: memberSteamId,
      teamId,
      active: 1,
      permissionLevel:
        member.permissionLevel === 'STATUS' ? 2 : member.permissionLevel === 'ADMIN' ? 1 : 0,
      paymentStatus: 0,
      startedAt: new Date(0),
      leftAt: null,
      player: {
        steamId: memberSteamId,
        steamUsername: String(user?.username ?? memberSteamId),
        steamAvatar: String(user?.avatarUrl ?? ''),
      },
    });
  }

  const divisionId = Number(row.divisionId);
  const regionId = Number(row.regionId);
  const seasonId = Number(row.seasonId);
  const division = Number.isFinite(divisionId)
    ? await getDivision(createDivisionsClient(opts), String(divisionId))
    : null;
  const region = Number.isFinite(regionId)
    ? await getRegion(createCatalogClient(opts), String(regionId))
    : null;
  const season = Number.isFinite(seasonId)
    ? await getSeason(createSeasonsClient(opts), String(seasonId))
    : null;

  return {
    id: teamId,
    name: String(row.name ?? ''),
    acronym: String(row.acronym ?? '') || null,
    formatId: Number(row.formatId),
    seasonId: Number.isFinite(seasonId) ? seasonId : null,
    divisionId: Number.isFinite(divisionId) ? divisionId : null,
    regionId: Number.isFinite(regionId) ? regionId : null,
    status: String(row.status ?? 'UNREADY'),
    division: division
      ? {
          id: divisionId,
          name: division.name,
          regionId,
          signupCost: Number(division.signupCost ?? 0),
          sortOrder: Number(division.sortOrder ?? 0),
        }
      : null,
    region: region
      ? {
          id: regionId,
          name: region.name,
          hidden: region.hidden,
          currencySymbol: region.currencySymbol,
          currencyCode: region.currencyCode,
        }
      : null,
    season: season
      ? {
          id: seasonId,
          seasonNum: Number(season.seasonNum),
          numWeeks: Number(season.numWeeks),
          regionId,
          formatId: Number(season.formatId),
          signupsOpen: Boolean(season.signupsOpen),
          rosterLocked: Boolean(season.rosterLocked),
          paymentRequired: Boolean(season.paymentRequired),
          matchWeek: Number(season.matchWeek ?? 0),
          matchDeadline: season.matchDeadline || null,
          info: season.info ?? '',
        }
      : null,
    players,
  } as unknown as TeamJoinTeam;
}

export async function validateTokenAndGetTeam(
  token: string,
  steamId?: string,
): Promise<TeamJoinInfo> {
  // Decode and validate token
  const { teamId } = validateJoinToken(token);

  const team = isRamaBackend()
    ? await loadTeamJoinTeamRama(teamId)
    : await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          division: true,
          region: true,
          season: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      });

  if (!team) {
    notFound('Team not found');
  }

  // Block joining 1v1 "teams" - they're individual entries, not actual teams
  if (team.formatId === FORMAT_1V1) {
    return {
      team,
      activePlayers: team.players,
      canJoin: false,
      error: '1v1 entries cannot be joined - they are individual player entries',
    };
  }

  const activePlayers = team.players;

  // Check if user is trying to join their own team
  if (steamId) {
    const isTeamMember = activePlayers.some(
      (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
    );
    if (isTeamMember) {
      return {
        team,
        activePlayers,
        canJoin: false,
        error: 'You cannot invite yourself to your own team',
      };
    }
  }

  // Check if team is full
  if (activePlayers.length >= 3) {
    return {
      team,
      activePlayers,
      canJoin: false,
      error: 'Team is full (maximum 3 players)',
    };
  }

  return {
    team,
    activePlayers,
    canJoin: true,
  };
}

/**
 * Validate join password
 * Requires the stored value to be a scrypt salt:hash pair. Legacy plaintext
 * passwords must be migrated via scripts/migrate-plaintext-join-passwords.ts.
 */
export async function validateJoinPassword(teamId: number, password: string): Promise<boolean> {
  if (isRamaBackend()) {
    const team = await getTeam(createTeamsClient(ramaClientOpts()), String(teamId));
    if (!team) notFound('Team not found');
    const stored = String(team.joinPassword ?? '');
    if (!stored) return false;
    return verifyPassword(password, stored);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { joinPassword: true },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (!team.joinPassword) {
    return false;
  }

  return verifyPassword(password, team.joinPassword);
}

/**
 * Join team by password — validates the password then creates a PendingPlayer
 * record with status=1 (awaiting admin approval).
 */
export async function joinByPassword(
  teamId: number,
  steamId: string,
  password: string,
): Promise<void> {
  const isValid = await validateJoinPassword(teamId, password);
  if (!isValid) {
    badRequest('Incorrect team password');
  }

  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const team = await getTeam(client, String(teamId));
    if (!team) notFound('Team not found');

    if (Number(team.formatId) === FORMAT_1V1) {
      badRequest('Cannot join 1v1 teams');
    }

    const seasonIdNum = Number(team.seasonId);
    if (Number.isFinite(seasonIdNum)) {
      const seasonActive = await isSeasonCurrentlyActive(seasonIdNum);
      if (!seasonActive) {
        badRequest("This team's season has ended. Joining is no longer available.");
      }
    }

    const roster = await getRoster(client, String(teamId));
    const activeCount = Object.values(roster).filter((m) => m.active).length;
    if (activeCount >= 3) {
      badRequest('Team is full (maximum 3 players)');
    }
    if (roster[steamId]) {
      badRequest('You are already on this team');
    }

    if (typeof team.seasonId === 'string') {
      const other = await getPlayerSeasonTeam(client, steamId, team.seasonId);
      if (other) {
        badRequest('You are already in another 2v2 team for this season');
      }
    }

    const ack = await requestJoin(client, { teamId: String(teamId), steamId });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to request join');
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: { where: { active: 1 } },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (team.formatId === FORMAT_1V1) {
    badRequest('Cannot join 1v1 teams');
  }

  if (team.seasonId) {
    const seasonActive = await isSeasonCurrentlyActive(team.seasonId);
    if (!seasonActive) {
      badRequest("This team's season has ended. Joining is no longer available.");
    }
  }

  if (team.players.length >= 3) {
    badRequest('Team is full (maximum 3 players)');
  }

  const isTeamMember = team.players.some(
    (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
  );
  if (isTeamMember) {
    badRequest('You are already on this team');
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: { in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1] },
      },
    },
  });

  if (playerInOtherTeam) {
    badRequest('You are already in another 2v2 team for this season');
  }

  await prisma.pendingPlayer.upsert({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    create: { playerSteamId: steamId, teamId, status: 1 },
    update: { status: 1 },
  });
}

/**
 * Accept invite by token — creates a PendingPlayer record with status=1
 * (awaiting admin approval). Returns teamId for redirect.
 */
export async function acceptInviteByToken(token: string, steamId: string): Promise<number> {
  const { teamId } = validateJoinToken(token);

  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const team = await getTeam(client, String(teamId));
    if (!team) notFound('Team not found');
    if (Number(team.formatId) === FORMAT_1V1) badRequest('Cannot join 1v1 teams');

    const seasonIdNum = Number(team.seasonId);
    if (Number.isFinite(seasonIdNum)) {
      const seasonActive = await isSeasonCurrentlyActive(seasonIdNum);
      if (!seasonActive) {
        badRequest("This team's season has ended. Joining is no longer available.");
      }
    }

    const roster = await getRoster(client, String(teamId));
    if (roster[steamId]?.active) badRequest('You cannot invite yourself to your own team');
    if (Object.values(roster).filter((m) => m.active).length >= 3) {
      badRequest('Team is full (maximum 3 players)');
    }
    if (typeof team.seasonId === 'string') {
      const other = await getPlayerSeasonTeam(client, steamId, team.seasonId);
      if (other) badRequest('You are already in another 2v2 team for this season');
    }

    const ack = await requestJoin(client, { teamId: String(teamId), steamId });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to accept invite');
    return teamId;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: { where: { active: 1 } },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (team.formatId === FORMAT_1V1) {
    badRequest('Cannot join 1v1 teams');
  }

  if (team.seasonId) {
    const seasonActive = await isSeasonCurrentlyActive(team.seasonId);
    if (!seasonActive) {
      badRequest("This team's season has ended. Joining is no longer available.");
    }
  }

  const isTeamMember = team.players.some(
    (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
  );
  if (isTeamMember) {
    badRequest('You cannot invite yourself to your own team');
  }

  if (team.players.length >= 3) {
    badRequest('Team is full (maximum 3 players)');
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: { in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1] },
      },
    },
  });

  if (playerInOtherTeam) {
    badRequest('You are already in another 2v2 team for this season');
  }

  await prisma.pendingPlayer.upsert({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    create: { playerSteamId: steamId, teamId, status: 1 },
    update: { status: 1 },
  });

  return teamId;
}

/**
 * Accept a Steam ID invite — upgrades the player's PendingPlayer record
 * from status=0 (team invite) to status=1 (awaiting admin approval).
 */
export async function acceptTeamInvite(steamId: string, teamId: number): Promise<void> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const team = await getTeam(client, String(teamId));
    const seasonIdNum = Number(team?.seasonId);
    if (Number.isFinite(seasonIdNum)) {
      const seasonActive = await isSeasonCurrentlyActive(seasonIdNum);
      if (!seasonActive) {
        badRequest("This team's season has ended. Joining is no longer available.");
      }
    }

    const ack = await ramaAcceptInvite(client, { teamId: String(teamId), steamId });
    if (!ack.ok) {
      if (ack.error === 'pending-not-found' || ack.error === 'pending-not-invite') {
        badRequest('No pending invitation found for this team');
      }
      badRequest(ack.error ?? 'Failed to accept invite');
    }
    return;
  }

  const pending = await prisma.pendingPlayer.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
  });

  if (!pending || pending.status !== 0) {
    badRequest('No pending invitation found for this team');
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { seasonId: true },
  });

  if (team?.seasonId) {
    const seasonActive = await isSeasonCurrentlyActive(team.seasonId);
    if (!seasonActive) {
      badRequest("This team's season has ended. Joining is no longer available.");
    }
  }

  await prisma.pendingPlayer.update({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    data: { status: 1 },
  });
}

/**
 * Get all pending records for a user (both status=0 team invites and
 * status=1 awaiting-admin requests).
 */
export async function getUserPendingInvites(steamId: string) {
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const teamsClient = createTeamsClient(opts);
    const byTeam = await getPendingByPlayer(teamsClient, steamId);
    const rows = [];
    for (const teamIdStr of Object.keys(byTeam).sort()) {
      const team = await loadTeamJoinTeamRama(Number(teamIdStr));
      if (!team) continue;
      rows.push({
        playerSteamId: steamId,
        teamId: Number(teamIdStr),
        status: Number(byTeam[teamIdStr]),
        team,
      });
    }
    return rows;
  }

  return await prisma.pendingPlayer.findMany({
    where: { playerSteamId: steamId },
    include: {
      team: {
        include: {
          division: true,
          region: true,
          season: true,
          players: { where: { active: 1 } },
        },
      },
    },
    orderBy: { teamId: 'asc' },
  });
}

/**
 * Check if a player is in a specific team
 */
export async function isPlayerInTeam(steamId: string, teamId: number): Promise<boolean> {
  if (isRamaBackend()) {
    const member = await getRosterMember(
      createTeamsClient(ramaClientOpts()),
      String(teamId),
      steamId,
    );
    return Boolean(member?.active);
  }

  const playerInTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      teamId,
      active: 1,
      permissionLevel: {
        gte: 0,
      },
    },
  });

  return !!playerInTeam;
}

/**
 * Check if a player is in any active 2v2 team for the current signup season
 * (allows being in old season teams)
 */
export async function isPlayerInAnyActiveTeam(steamId: string): Promise<boolean> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const seasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);
    for (const sid of seasonIds) {
      const teamId = await getPlayerSeasonTeam(client, steamId, String(sid));
      if (teamId) return true;
    }
    return false;
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: {
          in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1],
        },
      },
    },
  });

  return !!playerInOtherTeam;
}

/**
 * Returns the status of a player's pending record for a specific team,
 * or null if no record exists.
 * 0 = team invite awaiting player acceptance
 * 1 = awaiting admin approval
 */
export async function getPendingStatusForTeam(
  steamId: string,
  teamId: number,
): Promise<number | null> {
  if (isRamaBackend()) {
    return getPendingStatus(createTeamsClient(ramaClientOpts()), String(teamId), steamId);
  }

  const pending = await prisma.pendingPlayer.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    select: { status: true },
  });
  return pending?.status ?? null;
}

/**
 * Returns true if the player has an active join request (status=1) for any team.
 * status=0 records are unaccepted invites and do not block joining elsewhere.
 */
export async function hasAnyPendingRequest(steamId: string): Promise<boolean> {
  if (isRamaBackend()) {
    const byTeam = await getPendingByPlayer(createTeamsClient(ramaClientOpts()), steamId);
    return Object.values(byTeam).some((status) => status === 1);
  }

  const pending = await prisma.pendingPlayer.findFirst({
    where: { playerSteamId: steamId, status: 1 },
    select: { teamId: true },
  });
  return !!pending;
}

/**
 * Decline/delete pending invitation
 */
export async function declineInvitation(steamId: string, teamId: number): Promise<void> {
  if (isRamaBackend()) {
    const { declinePending } = await import('$lib/server/rama/teams');
    await declinePending(createTeamsClient(ramaClientOpts()), {
      teamId: String(teamId),
      steamId,
    });
    return;
  }

  await prisma.pendingPlayer.deleteMany({
    where: {
      playerSteamId: steamId,
      teamId,
    },
  });
}
