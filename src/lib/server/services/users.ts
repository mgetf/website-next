/**
 * Users Service
 *
 * Session + test-login paths use Rama UsersModule over REST when DATA_BACKEND=rama.
 * Remaining profile/admin paths still on Prisma until cut over.
 */

import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_2V2, FORMAT_1V1 } from '$lib/server/constants/formats';
import type { ProfileMatch } from '$lib/types/match';
import type {
  UserRecord,
  PublicUserRow,
  PaginationInfo,
  DiscordUserLookup,
  PlayerTeamMembership,
  TournamentPlacementRow,
  FightNightMatchupRow,
  PlayerProfile,
} from '$lib/types/service-models';
import type { UserRole } from '$lib/types/enums';
import { getOptionalEnv } from '$lib/server/utils/env';
import { formatPlayoffRound } from '$lib/utils/playoffs';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  createUsersClient,
  getSessionVersion as ramaGetSessionVersion,
  getUser as ramaGetUser,
  setBan as ramaSetBan,
  setPermission as ramaSetPermission,
  upsertProfile as ramaUpsertProfile,
} from '$lib/server/rama/users';

/** @lintignore Soft-stub / cutover API surface */
export type { ProfileMatch } from '$lib/types/match';

function usersClient() {
  return createUsersClient(ramaClientOpts());
}

/**
 * Fetch the current session version for a user.
 * Used by hooks to detect stale sessions after role/ban changes.
 */
export async function getSessionVersion(steamId: string): Promise<number> {
  if (isRamaBackend()) {
    return (await ramaGetSessionVersion(usersClient(), steamId)) ?? 0;
  }
  throw new Error('getSessionVersion requires DATA_BACKEND=rama');
}

/**
 * Fetch fresh session-relevant fields for a user.
 * Used by hooks to refresh a stale session cookie without forcing re-login.
 */
export async function getSessionFields(steamId: string) {
  if (isRamaBackend()) {
    const row = await ramaGetUser(usersClient(), steamId);
    if (!row) return null;
    return {
      steamUsername: String(row.username ?? ''),
      steamAvatar: String(row.avatarUrl ?? ''),
      permissionLevel: String(row.permissionLevel ?? 'GUEST'),
      banStatus: String(row.banStatus ?? 'NONE'),
      sessionVersion: typeof row.sessionVersion === 'number' ? row.sessionVersion : 0,
    };
  }
  throw new Error('getSessionFields requires DATA_BACKEND=rama');
}

/**
 * Upsert a user for non-production test login (Playwright / local).
 * Rama path: UsersModule upsert-profile + set-permission + set-ban.
 */
export async function upsertTestLoginUser(params: {
  steamId: string;
  username: string;
  role: 'GUEST' | 'MODERATOR' | 'ADMIN';
}) {
  const avatar =
    'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

  if (isRamaBackend()) {
    const client = usersClient();
    await ramaUpsertProfile(client, {
      steamId: params.steamId,
      username: params.username,
      avatarUrl: avatar,
    });
    await ramaSetPermission(client, {
      steamId: params.steamId,
      permissionLevel: params.role,
    });
    await ramaSetBan(client, { steamId: params.steamId, banStatus: 'NONE' });
    const row = await ramaGetUser(client, params.steamId);
    return {
      steamId: params.steamId,
      steamUsername: String(row?.username ?? params.username),
      steamAvatar: String(row?.avatarUrl ?? avatar),
      permissionLevel: String(row?.permissionLevel ?? params.role),
      banStatus: String(row?.banStatus ?? 'NONE'),
      sessionVersion: typeof row?.sessionVersion === 'number' ? row.sessionVersion : 0,
    };
  }
  throw new Error('upsertTestLoginUser requires DATA_BACKEND=rama');
}

/**
 * Get user by Steam ID with basic info
 */
export async function getUserBySteamId(steamId: string): Promise<UserRecord | null> {
  void steamId;
  return null;
}

export async function getRegisteredSteamIds(steamIds: string[]): Promise<string[]> {
  return [];
}

/**
 * Bulk-fetch name and avatar for a list of Steam64 IDs.
 * Used to annotate leaderboard entries with display names.
 */
export async function searchUsersByName(
  query: string,
  limit = 25,
): Promise<{ steamId: string; name: string; avatar: string | null }[]> {
  return [];
}

export async function getUserDisplaysByIds(
  steamIds: string[],
): Promise<Record<string, { name: string; avatar: string | null }>> {
  return {};
}

/**
 * Look up a user by their linked Discord ID.
 * Returns the Discord record (with player relation) or null if not linked.
 */
export async function getUserByDiscordId(discordId: string): Promise<DiscordUserLookup | null> {
  void discordId;
  return null;
}

/**
 * Get player's team memberships (current and past)
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getPlayerTeams(steamId: string): Promise<PlayerTeamMembership[]> {
  void steamId;
  return [];
}

/**
 * Check if a user is signed up for ANY active season of a given format,
 * regardless of region.
 */
export async function isUserSignedUpForFormat(steamId: string, formatId: number): Promise<boolean> {
  if (isRamaBackend()) {
    const { createSeasonsClient, getSeasonIds, getSeason } =
      await import('$lib/server/rama/seasons');
    const { createTeamsClient, getPlayerSeasonTeam, getTeam } =
      await import('$lib/server/rama/teams');
    const opts = ramaClientOpts();
    const seasonsClient = createSeasonsClient(opts);
    const teamsClient = createTeamsClient(opts);
    for (const seasonId of await getSeasonIds(seasonsClient)) {
      const season = await getSeason(seasonsClient, seasonId);
      if (!season || !season.signupsOpen) continue;
      if (Number(season.formatId) !== formatId) continue;
      const teamId = await getPlayerSeasonTeam(teamsClient, steamId, seasonId);
      if (!teamId) continue;
      const team = await getTeam(teamsClient, teamId);
      if (team && String(team.status) !== 'DEAD') return true;
    }
    return false;
  }
  throw new Error('isUserSignedUpForFormat requires DATA_BACKEND=rama');
}

/**
 * Get player's active 2v2 team (for navigation display)
 * Prioritizes teams in current signup seasons, falls back to any active team
 * Returns null if player is not in an active 2v2 team
 */
export async function getUserActiveTeam(
  steamId: string,
): Promise<{ id: number; name: string } | null> {
  if (isRamaBackend()) {
    const { createTeamsClient, getPlayerSeasonTeam, getTeam } =
      await import('$lib/server/rama/teams');
    const client = createTeamsClient(ramaClientOpts());
    const seasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);
    for (const seasonId of seasonIds) {
      const teamId = await getPlayerSeasonTeam(client, steamId, String(seasonId));
      if (!teamId) continue;
      const team = await getTeam(client, teamId);
      if (!team) continue;
      if (Number(team.formatId) !== FORMAT_2V2) continue;
      return { id: Number(teamId), name: String(team.name ?? '') };
    }
    // No name/player index for "any active team" fallback under Rama yet.
    return null;
  }
  throw new Error('getUserActiveTeam requires DATA_BACKEND=rama');
}

/**
 * Get player's 1v1 entries (for profile display)
 * Returns all 1v1 "teams" the player has created (current and past)
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getPlayer1v1Entries(steamId: string): Promise<PlayerTeamMembership[]> {
  void steamId;
  return [];
}

/**
 * Get player's event placements (1st, 2nd, 3rd place finishes) from unified event tables
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getPlayerTournamentPlacements(
  steamId: string,
): Promise<TournamentPlacementRow[]> {
  void steamId;
  return [];
}

/**
 * Get player's Fight Night match entries from unified event tables
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getPlayerFightNightMatchups(
  steamId: string,
): Promise<FightNightMatchupRow[]> {
  void steamId;
  return [];
}

/**
 * Transform player teams into current teams list
 */
/** @lintignore Soft-stub / cutover API surface */
export function transformCurrentTeams(playerTeams: any[]) {
  return playerTeams
    .filter((pt) => pt.active === 1)
    .map((pt) => ({
      teamId: pt.team.id,
      teamName: pt.team.name,
      division: pt.team.division?.name || 'N/A',
      regionName: pt.team.region?.name || 'N/A',
      seasonNum: pt.team.season?.seasonNum || 0,
      status: pt.team.status as string,
      wins: pt.team.wins,
      losses: pt.team.losses,
      totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
      joined: pt.startedAt,
      permissionLevel: pt.permissionLevel,
    }));
}

/**
 * Transform player teams into team history list
 */
/** @lintignore Soft-stub / cutover API surface */
export function transformTeamHistory(playerTeams: any[]) {
  return playerTeams
    .filter((pt) => pt.active === 0)
    .map((pt) => ({
      teamId: pt.team.id,
      teamName: pt.team.name,
      division: pt.team.division?.name || 'N/A',
      regionName: pt.team.region?.name || 'N/A',
      seasonNum: pt.team.season?.seasonNum || 0,
      status: pt.team.status as string,
      wins: pt.team.wins,
      losses: pt.team.losses,
      totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
      joined: pt.startedAt,
      left: pt.leftAt,
    }));
}

/**
 * Transform event placements into profile tournament results
 */
/** @lintignore Soft-stub / cutover API surface */
export function transformTournamentPlacements(placements: any[]) {
  const labels: Record<number, string> = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' };
  return placements.map((p) => ({
    id: p.event.id,
    name: p.event.name,
    date: p.event.startedAt,
    placement: labels[p.placement] || 'Participant',
  }));
}

/**
 * Transform event match player entries into Fight Night profile rows
 */
/** @lintignore Soft-stub / cutover API surface */
export function transformFightNightMatchups(entries: any[], steamId: string) {
  return entries.map((entry) => {
    const { match } = entry;
    const playerSide: number = entry.side;
    const opponents = match.players
      .filter((p: any) => p.side !== playerSide)
      .map((p: any) => p.user?.steamUsername || p.displayName || 'Unknown');
    const result = match.winnerSide === null ? 'TBD' : match.winnerSide === playerSide ? 'W' : 'L';

    let score = 'TBD';
    if (match.side1Score !== null && match.side2Score !== null) {
      const myScore = playerSide === 1 ? match.side1Score : match.side2Score;
      const theirScore = playerSide === 1 ? match.side2Score : match.side1Score;
      score = `${myScore} - ${theirScore}`;
    }

    return {
      id: match.id,
      fightNightName: match.stage.event.name,
      opponent: opponents.join(' & ') || 'Unknown',
      result,
      score,
      date: match.stage.event.startedAt || null,
    };
  });
}

/**
 * Build achievements from tournament placements
 * Only includes podium finishes (1st, 2nd, 3rd)
 */
/** @lintignore Soft-stub / cutover API surface */
export function buildAchievements(tournamentResults: any[]) {
  return tournamentResults
    .filter((t) => t.placement !== 'Participant')
    .map((t) => ({
      placement: t.placement,
      event: t.name,
      date: t.date,
    }));
}

/**
 * Fetch all league matches for a set of team IDs in one query.
 * Returns a map of teamId → ordered match list (chronological within each season).
 */
async function getMatchesByTeamIds(teamIds: number[]): Promise<Map<number, ProfileMatch[]>> {
  void teamIds;
  return new Map();
}

/**
 * Get complete player profile data
 * Used by player/[steamId] page
 */
export async function getPlayerProfile(steamId: string): Promise<PlayerProfile | null> {
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const user = await ramaGetUser(usersClient(), steamId);
    if (!user) return null;

    const { createTeamsClient, getPlayerSeasonMap, getTeam, getRosterMember } =
      await import('$lib/server/rama/teams');
    const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
    const { createCatalogClient, getRegion } = await import('$lib/server/rama/catalog');
    const { createSeasonsClient, getSeason } = await import('$lib/server/rama/seasons');
    const { createMatchClient, getTeamStats } = await import('$lib/server/rama/match');

    const teams = createTeamsClient(opts);
    const divisions = createDivisionsClient(opts);
    const catalog = createCatalogClient(opts);
    const seasons = createSeasonsClient(opts);
    const match = createMatchClient(opts);

    const seasonMap = await getPlayerSeasonMap(teams, steamId);
    const currentTeams: PlayerProfile['currentTeams'] = [];
    const entries1v1: PlayerProfile['entries1v1'] = [];

    for (const [seasonId, teamId] of Object.entries(seasonMap)) {
      const team = await getTeam(teams, teamId);
      if (!team) continue;
      const status = String(team.status ?? 'UNREADY');
      const formatId = Number(team.formatId);
      const divisionId = team.divisionId != null ? Number(team.divisionId) : null;
      const regionId = team.regionId != null ? Number(team.regionId) : null;
      const division = divisionId != null ? await getDivision(divisions, String(divisionId)) : null;
      const region = regionId != null ? await getRegion(catalog, String(regionId)) : null;
      const season = await getSeason(seasons, seasonId);
      const stats = await getTeamStats(match, teamId);
      const member = await getRosterMember(teams, teamId, steamId);
      const isPaid =
        member?.paymentStatus === 'PAID' ||
        member?.paymentStatus === 'EXEMPT' ||
        member?.paymentStatus === 'MARKED_PAID';

      if (formatId === FORMAT_1V1) {
        entries1v1.push({
          id: Number(teamId),
          active: status !== 'DEAD',
          status,
          division: division?.name || 'Unknown',
          divisionId,
          regionId,
          region: region?.name || 'Unknown',
          seasonNum: Number(season?.seasonNum ?? 0),
          wins: stats.wins,
          losses: stats.losses,
          startedAt: new Date(0),
          leftAt: null,
          isPaid: Boolean(isPaid),
          signupCost: Number(division?.signupCost ?? 0),
          matches: [],
        });
        continue;
      }

      if (formatId === FORMAT_2V2 && status !== 'DEAD' && member?.active) {
        currentTeams.push({
          teamId: Number(teamId),
          teamName: String(team.name ?? ''),
          division: division?.name || 'Unknown',
          regionName: region?.name || 'Unknown',
          seasonNum: Number(season?.seasonNum ?? 0),
          status,
          wins: stats.wins,
          losses: stats.losses,
          totalRecord: `${stats.wins}-${stats.losses}`,
          joined: new Date(0),
          permissionLevel:
            member.permissionLevel === 'STATUS' ? 2 : member.permissionLevel === 'ADMIN' ? 1 : 0,
          matches: [],
        });
      }
    }

    const current1v1 = entries1v1.find((e) => e.active) ?? null;

    return {
      player: {
        steamId,
        name: String(user.username ?? steamId),
        avatar: String(user.avatarUrl ?? '') || null,
        discordLinked: Boolean(user.discordId),
        discordUsername: null,
        permissionLevel: String(user.permissionLevel ?? 'GUEST'),
        banStatus: String(user.banStatus ?? 'NONE'),
        punishmentCount: 0,
        nameOverride: 0,
        avatarOverride: 0,
        staffDivisions: [],
      },
      currentTeams,
      teamHistory: [],
      tournaments: [],
      fightNights: [],
      achievements: [],
      current1v1Entry: current1v1
        ? {
            id: current1v1.id,
            division: current1v1.division,
            divisionId: current1v1.divisionId,
            region: current1v1.region,
            regionId: current1v1.regionId,
            seasonNum: current1v1.seasonNum,
            wins: current1v1.wins,
            losses: current1v1.losses,
          }
        : null,
      entries1v1,
    };
  }
  return null;
}

/**
 * Get all users with optional filtering and pagination
 * Used by admin panel user management
 */
export async function getUsers(options: {
  search?: string;
  permissionLevel?: string;
  banStatus?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserRecord[]> {
  void options;
  return [];
}

/**
 * Count users with optional filtering
 */
export async function countUsers(options: {
  search?: string;
  permissionLevel?: string;
  banStatus?: string;
}) {
  return 0;
}

/**
 * Update user's permission level, ban status, and staff assignment
 * Admin only operation
 */
export async function updateUser(
  steamId: string,
  data: {
    permissionLevel?: string;
    banStatus?: string;
    nameOverride?: number;
    staffDivisionIds?: number[];
  },
) {
  throw new Error('updateUser is not available under Rama');
}

/**
 * Get all staff members (users with MODERATOR or ADMIN permission level)
 * Used for staff lists on league pages
 */
export async function getStaffMembers(): Promise<
  Array<{
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
    permissionLevel: UserRole | string;
    staffDivisions: Array<{ id: number; name: string }>;
  }>
> {
  if (isRamaBackend()) {
    // No staff-division index in UsersModule yet — standings page tolerates empty staff.
    return [];
  }
  throw new Error('getStaffMembers requires DATA_BACKEND=rama');
}

/**
 * Clear a user's punishment status and deactivate active punishment records
 */
export async function clearPunishment(steamId: string, clearedBy: string) {
  if (isRamaBackend()) {
    void clearedBy;
    const client = usersClient();
    const existing = await ramaGetUser(client, steamId);
    if (!existing) throw new Error('User not found');
    const ack = await ramaSetBan(client, { steamId, banStatus: 'NONE' });
    if (!ack.ok) throw new Error(ack.error ?? 'Failed to clear punishment');
    return;
  }
  throw new Error('clearPunishment requires DATA_BACKEND=rama');
}

/**
 * Ban a user with a reason
 */
export async function banUser(
  steamId: string,
  bannedBy: string,
  severity: 'WARNING' | 'SUSPENDED' | 'BANNED',
  reason: string,
  duration?: number,
) {
  if (isRamaBackend()) {
    void bannedBy;
    void reason;
    void duration;
    if (severity === 'WARNING') {
      // UsersModule has no WARNING status — treat as soft warning with no ban flip.
      const existing = await ramaGetUser(usersClient(), steamId);
      if (!existing) throw new Error('User not found');
      return { steamId, severity, reason };
    }
    const client = usersClient();
    const existing = await ramaGetUser(client, steamId);
    if (!existing) throw new Error('User not found');
    const ack = await ramaSetBan(client, { steamId, banStatus: severity });
    if (!ack.ok) throw new Error(ack.error ?? 'Failed to ban user');
    return { steamId, severity, reason };
  }
  throw new Error('banUser requires DATA_BACKEND=rama');
}

/**
 * Admin: set a custom display name and lock it (prevents Steam auto-sync)
 */
export async function lockUserName(
  steamId: string,
  newName: string,
): Promise<{ steamId: string; steamUsername: string; steamAvatar: string | null }> {
  void steamId;
  void newName;
  throw new Error('lockUserName is not available under Rama');
}

/**
 * Admin: unlock a user's name and immediately sync from Steam
 */
export async function unlockUserName(
  steamId: string,
): Promise<{ steamId: string; steamUsername: string; steamAvatar: string | null }> {
  void steamId;
  throw new Error('unlockUserName is not available under Rama');
}

/**
 * Fetch a user's current Steam profile via the Steam Web API
 */
export async function fetchSteamProfile(
  steamId: string,
): Promise<{ personaname: string; avatarfull: string } | null> {
  const apiKey = getOptionalEnv('STEAM_API_KEY');
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const player = data?.response?.players?.[0];
    if (!player) return null;

    return {
      personaname: player.personaname,
      avatarfull: player.avatarfull,
    };
  } catch {
    return null;
  }
}

/**
 * Bulk-fetch Steam display names for a list of Steam64 IDs in a single API call.
 * Returns a map of steamId64 → personaname for players found.
 * Silently returns an empty map on API errors or missing key.
 */
export async function fetchSteamNames(steamIds: string[]): Promise<Record<string, string>> {
  if (steamIds.length === 0) return {};
  const apiKey = getOptionalEnv('STEAM_API_KEY');
  if (!apiKey) return {};

  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < steamIds.length; i += CHUNK_SIZE) {
    chunks.push(steamIds.slice(i, i + CHUNK_SIZE));
  }

  try {
    const responses = await Promise.all(
      chunks.map((chunk) =>
        fetch(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${chunk.join(',')}`,
        ).then((res) => (res.ok ? res.json() : { response: { players: [] } })),
      ),
    );

    const result: Record<string, string> = {};
    for (const data of responses) {
      const players: { steamid: string; personaname: string }[] = data?.response?.players ?? [];
      for (const p of players) {
        result[p.steamid] = p.personaname;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Admin: set a custom avatar URL and lock it (prevents Steam auto-sync)
 */
export async function lockUserAvatar(
  steamId: string,
  avatarUrl: string,
): Promise<{ steamId: string; steamUsername: string; steamAvatar: string | null }> {
  void steamId;
  void avatarUrl;
  throw new Error('lockUserAvatar is not available under Rama');
}

/**
 * Admin: unlock a user's avatar and immediately sync from Steam
 */
export async function unlockUserAvatar(
  steamId: string,
): Promise<{ steamId: string; steamUsername: string; steamAvatar: string | null }> {
  void steamId;
  throw new Error('unlockUserAvatar is not available under Rama');
}

/**
 * Unlink a user's Discord account
 * Can be used by the user themselves or by an admin
 */
export async function unlinkDiscord(steamId: string) {
  throw new Error('unlinkDiscord is not available under Rama');
}

/**
 * Get all users for public listing with pagination
 * Used by /users page
 */
export async function getUsersPublic(
  page: number = 1,
  search?: string,
  role?: string,
): Promise<{ users: PublicUserRow[]; pagination: PaginationInfo }> {
  void search;
  void role;
  return {
    users: [],
    pagination: {
      currentPage: page,
      totalPages: 0,
      totalCount: 0,
      perPage: 50,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

/**
 * Find or create a user from Steam login data, updating username/avatar as needed.
 * Returns resolved display values and whether this was a new account.
 */
export async function findOrCreateSteamUser(steamUserJson: {
  steamid: string;
  personaname: string;
  avatarfull: string;
}): Promise<{
  username: string;
  avatar: string;
  permissionLevel: string;
  banStatus: string;
  sessionVersion: number;
  isNewUser: boolean;
}> {
  const { steamid, personaname, avatarfull } = steamUserJson;

  if (isRamaBackend()) {
    const client = usersClient();
    const existing = await ramaGetUser(client, steamid);
    const isNewUser = !existing;
    await ramaUpsertProfile(client, {
      steamId: steamid,
      username: personaname,
      avatarUrl: avatarfull,
    });
    if (isNewUser) {
      await ramaSetPermission(client, { steamId: steamid, permissionLevel: 'GUEST' });
      await ramaSetBan(client, { steamId: steamid, banStatus: 'NONE' });
    }
    const row = await ramaGetUser(client, steamid);
    return {
      username: String(row?.username ?? personaname),
      avatar: String(row?.avatarUrl ?? avatarfull),
      permissionLevel: String(row?.permissionLevel ?? 'GUEST'),
      banStatus: String(row?.banStatus ?? 'NONE'),
      sessionVersion: typeof row?.sessionVersion === 'number' ? row.sessionVersion : 0,
      isNewUser,
    };
  }
  throw new Error('findOrCreateSteamUser requires DATA_BACKEND=rama');
}

/**
 * Link a Discord account to a Steam user via upsert
 */
export async function linkDiscordAccount(
  discordId: string,
  discordUsername: string,
  discordAvatar: string | null,
  steamId: string,
): Promise<void> {
  void discordId;
  void discordUsername;
  void discordAvatar;
  void steamId;
  throw new Error('linkDiscordAccount is not available under Rama');
}
