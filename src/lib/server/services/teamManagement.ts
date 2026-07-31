/**
 * Team Management Service
 * Handles team editing, roster management, and player approvals
 */

import { notFound, badRequest } from '$lib/server/utils/errors';
import { NotificationType } from '$lib/types/enums';
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
  setTeamStatus,
} from '$lib/server/rama/teams';
import { createUsersClient, getUser } from '$lib/server/rama/users';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';
import { createCatalogClient, getRegion } from '$lib/server/rama/catalog';
import { createSeasonsClient, getSeason } from '$lib/server/rama/seasons';

type TeamEditPlayer = {
  playerSteamId: string;
  teamId: number;
  active: number;
  permissionLevel: number;
  paymentStatus: number;
  startedAt: Date;
  leftAt: Date | null;
  player: { steamId: string; steamUsername: string; steamAvatar: string };
};

type TeamEditPending = {
  playerSteamId: string;
  teamId: number;
  status: number;
  player: { steamId: string; steamUsername: string; steamAvatar: string };
};

type TeamEditTeam = {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  status: string;
  joinPassword?: string | null;
  seasonId: number | null;
  divisionId: number | null;
  regionId: number | null;
  formatId: number;
  players: TeamEditPlayer[];
  pendingPlayers: TeamEditPending[];
  deniedPlayers: TeamEditPending[];
  season: {
    id: number;
    seasonNum: number;
    numWeeks: number;
    regionId: number | null;
    formatId: number;
    signupsOpen: boolean;
    rosterLocked: boolean;
    paymentRequired: boolean;
    matchWeek: number;
    matchDeadline: string | Date | null;
  } | null;
};

interface TeamEditData {
  team: TeamEditTeam;
  players: TeamEditPlayer[];
  sentInvites: TeamEditPending[];
  awaitingAdmin: TeamEditPending[];
  deniedPlayers: TeamEditPending[];
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
    sentInvites: pendingPlayers.filter((p) => p.status === 0),
    awaitingAdmin: pendingPlayers.filter((p) => p.status === 1),
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
  throw new Error('getTeamForEdit requires DATA_BACKEND=rama');
}

/**
 * Update team info (name, acronym, password)
 */
export async function updateTeamInfo(
  teamId: number,
  data: { name?: string; acronym?: string; joinPassword?: string },
): Promise<void> {
  throw new Error('updateTeamInfo is not available under Rama');
}

/**
 * Upload team avatar
 */
export async function uploadTeamAvatar(teamId: number, file: File): Promise<string | null> {
  throw new Error('uploadTeamAvatar is not available under Rama');
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
  throw new Error('removePlayer requires DATA_BACKEND=rama');
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
  throw new Error('promotePlayer requires DATA_BACKEND=rama');
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
  throw new Error('demotePlayer requires DATA_BACKEND=rama');
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
      NotificationType.PLAYER_INVITE,
      `/teams/${teamId}`,
      `You've been invited to join ${String(team?.name ?? 'a team')}`,
      inviterSteamId,
    );
    return;
  }
  throw new Error('invitePlayerBySteamId requires DATA_BACKEND=rama');
}

/**
 * Disband team (mark as DEAD and deactivate all players)
 */
export async function disbandTeam(teamId: number): Promise<void> {
  if (isRamaBackend()) {
    const client = createTeamsClient(ramaClientOpts());
    const teamKey = String(teamId);
    const team = await getTeam(client, teamKey);
    if (!team) notFound('Team not found');

    const statusAck = await setTeamStatus(client, { teamId: teamKey, status: 'DEAD' });
    if (!statusAck.ok) badRequest(statusAck.error ?? 'Failed to disband team');

    const roster = await getRoster(client, teamKey);
    for (const [steamId, member] of Object.entries(roster)) {
      if (!member.active) continue;
      const leaveAck = await leaveTeam(client, { teamId: teamKey, steamId });
      if (!leaveAck.ok) badRequest(leaveAck.error ?? 'Failed to remove roster member');
    }
    return;
  }
  throw new Error('disbandTeam requires DATA_BACKEND=rama');
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
  void teamId;
  void cascadeMatches;
  throw new Error('hardDeleteTeam is not available under Rama');
}
