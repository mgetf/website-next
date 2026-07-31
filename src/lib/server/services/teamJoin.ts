/**
 * Team Join Service
 * Handles team joining via token and password
 */

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

type TeamJoinTeam = any;

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
  const { teamId } = validateJoinToken(token);

  if (isRamaBackend()) {
    const team = await loadTeamJoinTeamRama(teamId);
    if (!team) notFound('Team not found');

    if (team.formatId === FORMAT_1V1) {
      return {
        team,
        activePlayers: team.players,
        canJoin: false,
        error: '1v1 entries cannot be joined - they are individual player entries',
      };
    }

    const activePlayers = team.players;

    if (steamId) {
      const isTeamMember = activePlayers.some(
        (p: { playerSteamId: string; permissionLevel: number }) =>
          p.playerSteamId === steamId && p.permissionLevel >= 0,
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

    if (activePlayers.length >= 3) {
      return {
        team,
        activePlayers,
        canJoin: false,
        error: 'Team is full (maximum 3 players)',
      };
    }

    return { team, activePlayers, canJoin: true };
  }

  throw new Error('validateTokenAndGetTeam requires DATA_BACKEND=rama');
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
  throw new Error('validateJoinPassword requires DATA_BACKEND=rama');
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
  throw new Error('joinByPassword requires DATA_BACKEND=rama');
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
  throw new Error('acceptInviteByToken requires DATA_BACKEND=rama');
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
  throw new Error('acceptTeamInvite requires DATA_BACKEND=rama');
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
  throw new Error('getUserPendingInvites requires DATA_BACKEND=rama');
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
  throw new Error('isPlayerInTeam requires DATA_BACKEND=rama');
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
  throw new Error('isPlayerInAnyActiveTeam requires DATA_BACKEND=rama');
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
  throw new Error('getPendingStatusForTeam requires DATA_BACKEND=rama');
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
  throw new Error('hasAnyPendingRequest requires DATA_BACKEND=rama');
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
  throw new Error('declineInvitation requires DATA_BACKEND=rama');
}
