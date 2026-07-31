/**
 * Team Management Service
 * Handles team editing, roster management, and player approvals
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { uploadToR2, saveTempFile, deleteTempFile, validateUploadedFile } from '../utils/r2Upload';
import path from 'path';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { createNotificationForUser } from './notifications';
import { hashPassword } from '../utils/password';
import { isSeasonCurrentlyActive } from './settings';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  createInvite,
  createTeamsClient,
  getPendingForTeam,
  getRoster,
  getRosterMember,
  getTeam,
  leaveTeam,
  setMemberPermission,
} from '$lib/server/rama/teams';
import { createUsersClient, getUser } from '$lib/server/rama/users';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';
import { createCatalogClient, getRegion } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason } from '$lib/server/rama/seasons';

type TeamEditTeam = Prisma.TeamGetPayload<{
  include: {
    division: true;
    region: true;
    season: {
      select: {
        id: true;
        seasonNum: true;
        numWeeks: true;
        regionId: true;
        formatId: true;
        signupsOpen: true;
        rosterLocked: true;
        paymentRequired: true;
        matchWeek: true;
        matchDeadline: true;
      };
    };
    players: {
      include: {
        player: true;
      };
    };
    pendingPlayers: {
      include: {
        player: true;
      };
    };
    deniedPlayers: {
      include: {
        player: true;
      };
    };
  };
}>;

interface TeamEditData {
  team: TeamEditTeam;
  players: TeamEditTeam['players'];
  sentInvites: TeamEditTeam['pendingPlayers'];
  awaitingAdmin: TeamEditTeam['pendingPlayers'];
  deniedPlayers: TeamEditTeam['deniedPlayers'];
  rosterLocked: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

function permToInt(level: string | undefined): number {
  if (level === 'STATUS') return 2;
  if (level === 'ADMIN') return 1;
  return 0;
}

function paymentToInt(status: string | undefined): number {
  if (status === 'PAID' || status === 'MARKED_PAID') return 1;
  if (status === 'FREE' || status === 'NOT_REQUIRED') return 2;
  return 0;
}

async function getTeamForEditRama(teamId: number, steamId: string): Promise<TeamEditData> {
  const opts = ramaClientOpts();
  const teamsClient = createTeamsClient(opts);
  const usersClient = createUsersClient(opts);
  const row = await getTeam(teamsClient, String(teamId));
  if (!row) notFound('Team not found');

  const roster = await getRoster(teamsClient, String(teamId));
  const pendingMap = await getPendingForTeam(teamsClient, String(teamId));

  const players = [];
  for (const [memberSteamId, member] of Object.entries(roster)) {
    const user = await getUser(usersClient, memberSteamId);
    players.push({
      playerSteamId: memberSteamId,
      teamId,
      active: member.active ? 1 : 0,
      permissionLevel: permToInt(member.permissionLevel),
      paymentStatus: paymentToInt(member.paymentStatus),
      startedAt: new Date(0),
      leftAt: null,
      player: {
        steamId: memberSteamId,
        steamUsername: String(user?.username ?? memberSteamId),
        steamAvatar: String(user?.avatarUrl ?? ''),
      },
    });
  }
  players.sort((a, b) => b.permissionLevel - a.permissionLevel);

  const pendingPlayers = [];
  for (const [pendingSteamId, pending] of Object.entries(pendingMap)) {
    const user = await getUser(usersClient, pendingSteamId);
    pendingPlayers.push({
      playerSteamId: pendingSteamId,
      teamId,
      status: Number(pending.status),
      player: {
        steamId: pendingSteamId,
        steamUsername: String(user?.username ?? pendingSteamId),
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

  const team = {
    id: teamId,
    name: String(row.name ?? ''),
    acronym: String(row.acronym ?? '') || null,
    formatId: Number(row.formatId),
    seasonId: Number.isFinite(seasonId) ? seasonId : null,
    divisionId: Number.isFinite(divisionId) ? divisionId : null,
    regionId: Number.isFinite(regionId) ? regionId : null,
    status: String(row.status ?? 'UNREADY'),
    joinPassword: String(row.joinPassword ?? ''),
    avatar: null,
    paymentStatus: 0,
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
        }
      : null,
    players,
    pendingPlayers,
    deniedPlayers: [],
  } as unknown as TeamEditTeam;

  const userInTeam = players.find((p) => p.playerSteamId === steamId && p.active === 1);
  const isOwner = userInTeam?.permissionLevel === 2;
  const isAdmin = userInTeam?.permissionLevel === 1 || Boolean(isOwner);
  const rosterLocked = team.season?.rosterLocked
    ? await isSeasonCurrentlyActive(team.season.id)
    : false;

  return {
    team,
    players: team.players,
    sentInvites: pendingPlayers.filter((p) => p.status === 0) as TeamEditTeam['pendingPlayers'],
    awaitingAdmin: pendingPlayers.filter((p) => p.status === 1) as TeamEditTeam['pendingPlayers'],
    deniedPlayers: [],
    rosterLocked,
    isOwner: Boolean(isOwner),
    isAdmin,
  };
}

/**
 * Get team data for editing
 * Now uses per-season roster lock instead of global
 */
export async function getTeamForEdit(teamId: number, steamId: string): Promise<TeamEditData> {
  if (isRamaBackend()) return getTeamForEditRama(teamId, steamId);

  // Load team with all relations, including season settings
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: true,
      region: true,
      season: {
        select: {
          id: true,
          seasonNum: true,
          numWeeks: true,
          regionId: true,
          formatId: true,
          signupsOpen: true,
          rosterLocked: true,
          paymentRequired: true,
          matchWeek: true,
          matchDeadline: true,
        },
      },
      players: {
        include: {
          player: true,
        },
        orderBy: {
          permissionLevel: 'desc',
        },
      },
      pendingPlayers: {
        where: {
          status: { in: [0, 1] },
        },
        include: {
          player: true,
        },
      },
      deniedPlayers: {
        include: {
          player: true,
        },
        orderBy: {
          deniedAt: 'desc',
        },
        take: 10, // Last 10 denied players
      },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  // Check user's permission in the team
  const userInTeam = team.players.find((p) => p.playerSteamId === steamId);
  const isOwner = userInTeam?.permissionLevel === 2;
  const isAdmin = userInTeam?.permissionLevel === 1 || isOwner;

  const rosterLocked = team.season?.rosterLocked
    ? await isSeasonCurrentlyActive(team.season.id)
    : false;

  return {
    team,
    players: team.players,
    sentInvites: team.pendingPlayers.filter((p) => p.status === 0),
    awaitingAdmin: team.pendingPlayers.filter((p) => p.status === 1),
    deniedPlayers: team.deniedPlayers,
    rosterLocked,
    isOwner,
    isAdmin,
  };
}

/**
 * Update team info (name, acronym, password)
 */
export async function updateTeamInfo(
  teamId: number,
  data: { name?: string; acronym?: string; joinPassword?: string },
): Promise<void> {
  // Validate name if provided
  if (data.name) {
    if (data.name.length > 25) {
      badRequest('Team name must be 25 characters or less');
    }
    if (/<|>/.test(data.name)) {
      badRequest('Team name cannot contain < or > characters');
    }

    // Check for duplicate
    const duplicate = await prisma.team.findFirst({
      where: {
        name: data.name,
        NOT: { id: teamId },
      },
    });

    if (duplicate) {
      badRequest('A team with this name already exists');
    }

    // Get old team name for history
    const oldTeam = await prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    });

    if (oldTeam && oldTeam.name !== data.name) {
      // Add to name history
      await prisma.teamNameHistory.create({
        data: {
          teamId,
          name: data.name,
        },
      });
    }
  }

  // Validate acronym if provided
  if (data.acronym && data.acronym.length > 4) {
    badRequest('Team acronym must be 4 characters or less');
  }

  // Hash the new password if provided
  const hashedPassword = data.joinPassword ? await hashPassword(data.joinPassword) : undefined;

  // Update team
  await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.acronym !== undefined && { acronym: data.acronym }),
      ...(hashedPassword && { joinPassword: hashedPassword }),
    },
  });
}

/**
 * Upload team avatar
 */
export async function uploadTeamAvatar(teamId: number, file: File): Promise<string | null> {
  // Validate file
  validateUploadedFile(file);

  // Save temporarily
  const tempFilePath = await saveTempFile(file);

  try {
    // Upload to R2 (returns null if R2 not configured)
    const ext = path.extname(file.name);
    const remotePath = `team-avatars/${Date.now()}${ext}`;
    const avatarUrl = await uploadToR2(tempFilePath, remotePath);

    // Only update team if upload succeeded
    if (avatarUrl) {
      await prisma.team.update({
        where: { id: teamId },
        data: { avatar: avatarUrl },
      });
    } else {
      console.warn('Avatar upload skipped - R2 not configured');
    }

    // Delete temp file
    deleteTempFile(tempFilePath);

    return avatarUrl;
  } catch (err) {
    // Clean up temp file on error
    deleteTempFile(tempFilePath);
    throw err;
  }
}

/**
 * Remove player from team
 */
export async function removePlayer(teamId: number, playerSteamId: string): Promise<void> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const member = await getRosterMember(client, String(teamId), playerSteamId);
    if (!member) notFound('Player not found in team');
    if (member.permissionLevel === 'STATUS') badRequest('Cannot remove team owner');
    const ack = await leaveTeam(client, { teamId: String(teamId), steamId: playerSteamId });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to remove player');
    return;
  }

  // Check player is not owner
  const player = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
  });

  if (!player) {
    notFound('Player not found in team');
  }

  if (player.permissionLevel === 2) {
    badRequest('Cannot remove team owner');
  }

  // Set player as inactive
  await prisma.playerInTeam.update({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
    data: {
      active: 0,
      permissionLevel: -2,
      leftAt: new Date(),
    },
  });
}

/**
 * Promote player (increase permission level)
 */
export async function promotePlayer(teamId: number, playerSteamId: string): Promise<void> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const member = await getRosterMember(client, String(teamId), playerSteamId);
    if (!member?.active) notFound('Player not found in team');
    if (member.permissionLevel !== 'MEMBER') {
      badRequest('Player already has maximum promotion level');
    }
    const ack = await setMemberPermission(client, {
      teamId: String(teamId),
      steamId: playerSteamId,
      permissionLevel: 'ADMIN',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to promote player');
    return;
  }

  const player = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
  });

  if (!player || player.active !== 1) {
    notFound('Player not found in team');
  }

  // Can only promote from 0 to 1 (Member to Admin)
  if (player.permissionLevel >= 1) {
    badRequest('Player already has maximum promotion level');
  }

  await prisma.playerInTeam.update({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
    data: {
      permissionLevel: player.permissionLevel + 1,
    },
  });
}

/**
 * Demote player (decrease permission level)
 */
export async function demotePlayer(teamId: number, playerSteamId: string): Promise<void> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const member = await getRosterMember(client, String(teamId), playerSteamId);
    if (!member?.active) notFound('Player not found in team');
    if (member.permissionLevel === 'STATUS') badRequest('Cannot demote team owner');
    if (member.permissionLevel === 'MEMBER') {
      badRequest('Player already has minimum permission level');
    }
    const ack = await setMemberPermission(client, {
      teamId: String(teamId),
      steamId: playerSteamId,
      permissionLevel: 'MEMBER',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to demote player');
    return;
  }

  const player = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
  });

  if (!player || player.active !== 1) {
    notFound('Player not found in team');
  }

  // Can only demote from 1 to 0 (Admin to Member)
  if (player.permissionLevel <= 0) {
    badRequest('Player already has minimum permission level');
  }

  if (player.permissionLevel === 2) {
    badRequest('Cannot demote team owner');
  }

  await prisma.playerInTeam.update({
    where: {
      playerSteamId_teamId: {
        playerSteamId,
        teamId,
      },
    },
    data: {
      permissionLevel: player.permissionLevel - 1,
    },
  });
}

/**
 * Invite player by Steam ID
 */
export async function invitePlayerBySteamId(
  teamId: number,
  steamId: string,
  inviterSteamId?: string,
): Promise<void> {
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const user = await getUser(createUsersClient(opts), steamId);
    if (!user) notFound('User with this Steam ID not found');

    const teamsClient = createTeamsClient(opts);
    const team = await getTeam(teamsClient, String(teamId));
    const ack = await createInvite(teamsClient, { teamId: String(teamId), steamId });
    if (!ack.ok) {
      if (ack.error === 'already-on-roster') badRequest('Player is already in this team');
      if (ack.error === 'pending-exists') badRequest('Player already has a pending invitation');
      badRequest(ack.error ?? 'Failed to invite player');
    }

    await createNotificationForUser(
      steamId,
      'PLAYER_INVITE',
      `/teams/${teamId}`,
      `You've been invited to join ${String(team?.name ?? 'a team')}`,
      inviterSteamId,
    );
    return;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { steamId },
  });

  if (!user) {
    notFound('User with this Steam ID not found');
  }

  // Get team name for notification
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  // Check if already in team
  const existingMember = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId: steamId,
        teamId,
      },
    },
  });

  if (existingMember && existingMember.active === 1) {
    badRequest('Player is already in this team');
  }

  // Check if already has pending invite
  const existingPending = await prisma.pendingPlayer.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId: steamId,
        teamId,
      },
    },
  });

  if (existingPending) {
    badRequest('Player already has a pending invitation');
  }

  // Create pending player record
  await prisma.pendingPlayer.create({
    data: {
      playerSteamId: steamId,
      teamId,
      status: 0, // Pending
    },
  });

  // Send notification to invited player
  await createNotificationForUser(
    steamId,
    'PLAYER_INVITE',
    `/teams/${teamId}`,
    `You've been invited to join ${team?.name || 'a team'}`,
    inviterSteamId,
  );
}

/**
 * Disband team (mark as DEAD and deactivate all players)
 */
export async function disbandTeam(teamId: number): Promise<void> {
  // Mark team as DEAD
  await prisma.team.update({
    where: { id: teamId },
    data: {
      status: 'DEAD',
    },
  });

  // Deactivate all players in the team
  await prisma.playerInTeam.updateMany({
    where: {
      teamId,
      active: 1,
    },
    data: {
      active: 0,
      permissionLevel: -2,
      leftAt: new Date(),
    },
  });

  // Delete all pending players (they don't need to be kept)
  await prisma.pendingPlayer.deleteMany({
    where: { teamId },
  });
}

/**
 * Permanently delete a team and all related records.
 * When `cascadeMatches` is false (default), blocks if the team has matches.
 * When `cascadeMatches` is true, deletes all matches and their children too.
 */
export async function hardDeleteTeam(
  teamId: number,
  cascadeMatches = false,
): Promise<{ teamName: string; deletedMatches: number }> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      name: true,
      _count: {
        select: {
          homeMatches: true,
          awayMatches: true,
        },
      },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  const matchCount = team._count.homeMatches + team._count.awayMatches;

  if (matchCount > 0 && !cascadeMatches) {
    badRequest(
      `Cannot delete team with ${matchCount} match${matchCount !== 1 ? 'es' : ''}. Remove matches first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (matchCount > 0) {
      const matches = await tx.match.findMany({
        where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
        include: { games: true },
      });
      const matchIds = matches.map((m) => m.id);

      // Reverse stats on opponent teams for every played match being cascade-deleted.
      // The deleted team's own row is about to be removed, so only the survivor needs fixing.
      for (const match of matches) {
        if (match.status !== 'PLAYED' || match.winnerId == null) continue;

        const isHome = match.homeTeamId === teamId;
        const opponentId = isHome ? match.awayTeamId : match.homeTeamId;

        const opponentWins = match.games.filter((g) =>
          isHome
            ? (g.awayTeamScore ?? 0) > (g.homeTeamScore ?? 0)
            : (g.homeTeamScore ?? 0) > (g.awayTeamScore ?? 0),
        ).length;
        const opponentLosses = match.games.filter((g) =>
          isHome
            ? (g.homeTeamScore ?? 0) > (g.awayTeamScore ?? 0)
            : (g.awayTeamScore ?? 0) > (g.homeTeamScore ?? 0),
        ).length;
        const opponentPoints = match.games.reduce(
          (sum, g) => sum + (isHome ? (g.awayTeamScore ?? 0) : (g.homeTeamScore ?? 0)),
          0,
        );
        const opponentPointsAgainst = match.games.reduce(
          (sum, g) => sum + (isHome ? (g.homeTeamScore ?? 0) : (g.awayTeamScore ?? 0)),
          0,
        );

        await tx.team.update({
          where: { id: opponentId },
          data: {
            wins: { decrement: match.winnerId === opponentId ? 1 : 0 },
            losses: { decrement: match.winnerId === teamId ? 1 : 0 },
            gamesWon: { decrement: opponentWins },
            gamesLost: { decrement: opponentLosses },
            pointsScored: { decrement: opponentPoints },
            pointsScoredAgainst: { decrement: opponentPointsAgainst },
          },
        });
      }

      const demoIds = (
        await tx.demo.findMany({
          where: { matchId: { in: matchIds } },
          select: { id: true },
        })
      ).map((d) => d.id);

      if (demoIds.length > 0) {
        await tx.demoReport.deleteMany({ where: { demoId: { in: demoIds } } });
        await tx.demo.deleteMany({ where: { id: { in: demoIds } } });
      }

      const mapBanIds = (
        await tx.matchMapBan.findMany({
          where: { matchId: { in: matchIds } },
          select: { id: true },
        })
      ).map((b) => b.id);

      if (mapBanIds.length > 0) {
        await tx.mapBanAction.deleteMany({ where: { matchMapBanId: { in: mapBanIds } } });
        await tx.matchMapBan.deleteMany({ where: { id: { in: mapBanIds } } });
      }

      await tx.matchComm.deleteMany({ where: { matchId: { in: matchIds } } });
      await tx.game.deleteMany({ where: { matchId: { in: matchIds } } });
      await tx.match.deleteMany({ where: { id: { in: matchIds } } });
    }

    await tx.mapBanAction.deleteMany({ where: { teamId } });
    await tx.pendingPlayer.deleteMany({ where: { teamId } });
    await tx.deniedPlayer.deleteMany({ where: { teamId } });
    await tx.playerInTeam.deleteMany({ where: { teamId } });
    await tx.teamHistory.deleteMany({ where: { teamId } });
    await tx.teamNameHistory.deleteMany({ where: { teamId } });
    await tx.payment.updateMany({ where: { teamId }, data: { teamId: null } });
    await tx.team.delete({ where: { id: teamId } });
  });

  return { teamName: team.name, deletedMatches: matchCount };
}
