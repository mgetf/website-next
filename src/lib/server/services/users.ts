/**
 * Users Service
 *
 * All user-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import type { ProfileMatch } from '$lib/types/match';
import { BanStatus, UserRole } from '$lib/types/user';
import { getOptionalEnv } from '$lib/server/utils/env';
import { compareMatchHistoryOrder, formatPlayoffRound } from '$lib/utils/playoffs';
import { invalidateCachedSessionVersion } from '$lib/server/auth/sessionCache';
import { conflict } from '$lib/server/utils/errors';
import { isSafeUrl } from '$lib/utils/safeUrl';
import {
  mapStaffAssignmentForDisplay,
  replaceStaffAssignments,
  staffAssignmentInclude,
  type StaffAssignmentPair,
} from './staffAssignments';

export type { ProfileMatch } from '$lib/types/match';

/**
 * Fetch the current session version for a user.
 * Used by hooks to detect stale sessions after role/ban changes.
 */
export async function getSessionVersion(steamId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { sessionVersion: true },
  });
  return user?.sessionVersion ?? 0;
}

/**
 * Fetch fresh session-relevant fields for a user.
 * Used by hooks to refresh a stale session cookie without forcing re-login.
 */
export async function getSessionFields(steamId: string) {
  return await prisma.user.findUnique({
    where: { steamId },
    select: {
      steamUsername: true,
      steamAvatar: true,
      permissionLevel: true,
      banStatus: true,
      sessionVersion: true,
    },
  });
}

/**
 * Get user by Steam ID with basic info
 */
export async function getUserBySteamId(steamId: string) {
  return await prisma.user.findUnique({
    where: { steamId },
    include: {
      discord: true,
      staffAssignments: {
        include: staffAssignmentInclude,
      },
    },
  });
}

export async function getRegisteredSteamIds(steamIds: string[]): Promise<string[]> {
  if (steamIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { steamId: { in: steamIds } },
    select: { steamId: true },
  });
  return users.map((u) => u.steamId);
}

/**
 * Bulk-fetch name and avatar for a list of Steam64 IDs.
 * Used to annotate leaderboard entries with display names.
 */
export async function searchUsersByName(
  query: string,
  limit = 25,
): Promise<{ steamId: string; name: string; avatar: string | null }[]> {
  if (!query.trim()) return [];
  const users = await prisma.user.findMany({
    where: { steamUsername: { contains: query.trim(), mode: 'insensitive' } },
    select: { steamId: true, steamUsername: true, steamAvatar: true },
    take: limit,
  });
  return users.map((u) => ({
    steamId: u.steamId,
    name: u.steamUsername,
    avatar: u.steamAvatar ?? null,
  }));
}

export async function getUserDisplaysByIds(
  steamIds: string[],
): Promise<Record<string, { name: string; avatar: string | null }>> {
  if (steamIds.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { steamId: { in: steamIds } },
    select: { steamId: true, steamUsername: true, steamAvatar: true },
  });
  const result: Record<string, { name: string; avatar: string | null }> = {};
  for (const u of users) {
    result[u.steamId] = { name: u.steamUsername, avatar: u.steamAvatar ?? null };
  }
  return result;
}

/**
 * Look up a user by their linked Discord ID.
 * Returns the Discord record (with player relation) or null if not linked.
 */
export async function getUserByDiscordId(discordId: string) {
  return await prisma.discord.findUnique({
    where: { discordId },
    include: { player: true },
  });
}

/**
 * Get player's team-format memberships (current and past).
 * Individual-format entries are loaded separately via getPlayer1v1Entries.
 */
export async function getPlayerTeams(steamId: string) {
  return await prisma.playerInTeam.findMany({
    where: {
      playerSteamId: steamId,
      team: {
        format: { isIndividual: false },
      },
    },
    include: {
      team: {
        include: {
          division: true,
          region: true,
          season: true,
          format: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: {
      startedAt: 'desc',
    },
  });
}

/**
 * Check if a user is signed up for ANY active season of a given format,
 * regardless of region.
 */
export async function isUserSignedUpForFormat(steamId: string, formatId: number): Promise<boolean> {
  const entry = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId,
        status: {
          notIn: ['DEAD'],
        },
        season: {
          signupsOpen: true,
        },
      },
    },
  });

  return !!entry;
}

/**
 * True when the user has an active non-dead entry in every given format.
 * Empty formatIds (no open signups) returns true so the nav Sign Up button stays hidden.
 */
export async function isSignedUpForAllOpenFormats(
  steamId: string,
  formatIds: number[],
): Promise<boolean> {
  if (formatIds.length === 0) return true;
  const results = await Promise.all(formatIds.map((id) => isUserSignedUpForFormat(steamId, id)));
  return results.every(Boolean);
}

/**
 * Get player's active team-format membership for navigation ("My Team").
 * Prioritizes teams in current signup seasons, falls back to any active team.
 * Individual-format entries are excluded.
 */
export async function getUserActiveTeam(
  steamId: string,
): Promise<{ id: number; name: string } | null> {
  const currentSeasonIds = await getCurrentSignupSeasonIds();

  if (currentSeasonIds.length > 0) {
    const currentSeasonTeam = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        team: {
          format: { isIndividual: false },
          seasonId: {
            in: currentSeasonIds,
          },
        },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (currentSeasonTeam?.team) {
      return currentSeasonTeam.team;
    }
  }

  const teamMembership = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        format: { isIndividual: false },
      },
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return teamMembership?.team || null;
}

/**
 * Get player's 1v1 entries (for profile display)
 * Returns all 1v1 "teams" the player has created (current and past)
 */
export async function getPlayer1v1Entries(steamId: string) {
  return await prisma.playerInTeam.findMany({
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
}

/**
 * Get player's event placements (1st, 2nd, 3rd place finishes) from unified event tables
 */
export async function getPlayerTournamentPlacements(steamId: string) {
  return await prisma.eventPlacement.findMany({
    where: { steamId },
    include: {
      event: { select: { id: true, name: true, startedAt: true } },
    },
    orderBy: { event: { startedAt: 'desc' } },
  });
}

/**
 * Get player's Fight Night match entries from unified event tables
 */
export async function getPlayerFightNightMatchups(steamId: string) {
  return await prisma.eventMatchPlayer.findMany({
    where: {
      steamId,
      match: { stage: { event: { type: 'FIGHT_NIGHT' } } },
    },
    include: {
      match: {
        include: {
          players: { include: { user: true } },
          stage: { include: { event: true } },
        },
      },
    },
    orderBy: { match: { id: 'desc' } },
  });
}

/**
 * Transform player teams into current teams list
 */
export function transformCurrentTeams(playerTeams: any[]) {
  return playerTeams
    .filter((pt) => pt.active === 1)
    .map((pt) => ({
      teamId: pt.team.id,
      teamName: pt.team.name,
      formatName: pt.team.format?.name || 'Team',
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
export function transformTeamHistory(playerTeams: any[]) {
  return playerTeams
    .filter((pt) => pt.active === 0)
    .map((pt) => ({
      teamId: pt.team.id,
      teamName: pt.team.name,
      formatName: pt.team.format?.name || 'Team',
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
  if (teamIds.length === 0) return new Map();

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: [{ weekNo: 'asc' }, { id: 'asc' }],
  });

  // Regular season first, then playoffs in bracket order (signed playoffRound
  // cannot be sorted correctly by a simple Prisma orderBy).
  matches.sort((a, b) =>
    compareMatchHistoryOrder(
      { weekNo: a.weekNo, playoffRound: a.playoffRound, id: a.id },
      { weekNo: b.weekNo, playoffRound: b.playoffRound, id: b.id },
    ),
  );

  const result = new Map<number, ProfileMatch[]>();
  for (const id of teamIds) result.set(id, []);

  const teamIdSet = new Set(teamIds);

  for (const match of matches) {
    const processForTeam = (teamId: number, isHome: boolean) => {
      if (!teamIdSet.has(teamId)) return;

      const opponent = isHome ? match.awayTeam : match.homeTeam;
      const won = match.winnerId === teamId;
      const matchResult: 'W' | 'L' | 'TBD' = match.winnerId ? (won ? 'W' : 'L') : 'TBD';

      let score = 'TBD';
      if (match.winnerScore !== null && match.loserScore !== null) {
        score = won
          ? `${match.winnerScore}-${match.loserScore}`
          : `${match.loserScore}-${match.winnerScore}`;
      }

      let week = '—';
      if (match.playoffRound !== null) {
        week = formatPlayoffRound(match.playoffRound);
      } else if (match.weekNo !== null) {
        week = `Week ${match.weekNo}`;
      }

      result.get(teamId)!.push({
        matchId: match.id,
        week,
        opponentName: opponent.name,
        opponentId: opponent.id,
        result: matchResult,
        score,
      });
    };

    processForTeam(match.homeTeamId, true);
    processForTeam(match.awayTeamId, false);
  }

  return result;
}

/**
 * Get complete player profile data
 * Used by player/[steamId] page
 */
export async function getPlayerProfile(steamId: string) {
  // Fetch user basic info
  const user = await getUserBySteamId(steamId);

  if (!user) {
    return null;
  }

  // Fetch all related data in parallel
  const [playerTeams, tournaments, fightNightMatchups, player1v1Entries, punishmentCount] =
    await Promise.all([
      getPlayerTeams(steamId),
      getPlayerTournamentPlacements(steamId),
      getPlayerFightNightMatchups(steamId),
      getPlayer1v1Entries(steamId),
      prisma.punishment.count({ where: { playerSteamId: steamId } }),
    ]);

  // Transform data
  const currentTeams = transformCurrentTeams(playerTeams);
  const teamHistory = transformTeamHistory(playerTeams);
  const tournamentResults = transformTournamentPlacements(tournaments);
  const fightNights = transformFightNightMatchups(fightNightMatchups, steamId);
  const achievements = buildAchievements(tournamentResults);

  const current1v1Entry = player1v1Entries.find((e) => e.team.status !== 'DEAD');
  const entries1v1Base = player1v1Entries.map((entry) => ({
    id: entry.team.id,
    active: entry.team.status !== 'DEAD',
    status: entry.team.status,
    division: entry.team.division?.name || 'Unknown',
    divisionId: entry.team.division?.id ?? null,
    regionId: entry.team.regionId ?? null,
    region: entry.team.region?.name || 'Unknown',
    seasonNum: entry.team.season?.seasonNum || 0,
    wins: entry.team.wins,
    losses: entry.team.losses,
    startedAt: entry.startedAt,
    leftAt: entry.leftAt,
    isPaid: entry.paymentStatus !== 0,
    signupCost: entry.team.division?.signupCost ?? 0,
  }));

  // Batch-fetch all league matches for 2v2 teams and 1v1 entries
  const allTeamIds = [
    ...currentTeams.map((t) => t.teamId),
    ...teamHistory.map((t) => t.teamId),
    ...entries1v1Base.map((e) => e.id),
  ];
  const matchesMap = await getMatchesByTeamIds(allTeamIds);

  // Attach matches to each team and entry
  const currentTeamsWithMatches = currentTeams.map((t) => ({
    ...t,
    matches: matchesMap.get(t.teamId) ?? [],
  }));
  const teamHistoryWithMatches = teamHistory.map((t) => ({
    ...t,
    matches: matchesMap.get(t.teamId) ?? [],
  }));
  const entries1v1 = entries1v1Base.map((e) => ({
    ...e,
    matches: matchesMap.get(e.id) ?? [],
  }));

  return {
    player: {
      steamId: user.steamId,
      name: user.steamUsername,
      avatar: user.steamAvatar,
      discordLinked: !!user.discord,
      discordUsername: user.discord?.discordUsername || null,
      permissionLevel: user.permissionLevel,
      banStatus: user.banStatus,
      punishmentCount,
      nameOverride: user.nameOverride,
      avatarOverride: user.avatarOverride,
      staffAssignments: user.staffAssignments.map(mapStaffAssignmentForDisplay),
    },
    currentTeams: currentTeamsWithMatches,
    teamHistory: teamHistoryWithMatches,
    tournaments: tournamentResults,
    fightNights,
    achievements,
    // 1v1 League data
    current1v1Entry: current1v1Entry
      ? {
          id: current1v1Entry.team.id,
          division: current1v1Entry.team.division?.name || 'Unknown',
          divisionId: current1v1Entry.team.division?.id ?? null,
          region: current1v1Entry.team.region?.name || 'Unknown',
          regionId: current1v1Entry.team.regionId ?? null,
          seasonNum: current1v1Entry.team.season?.seasonNum || 0,
          wins: current1v1Entry.team.wins,
          losses: current1v1Entry.team.losses,
        }
      : null,
    entries1v1,
  };
}

/**
 * Public profile for a platform player who has never signed into mge.tf.
 * Used so ELO leaderboard links can land on /users/:steamId instead of Steam.
 */
export function getGuestPlayerProfile(steamId: string, name: string | null) {
  return {
    player: {
      steamId,
      name: name ?? 'Unknown Player',
      avatar: null,
      discordLinked: false,
      discordUsername: null,
      permissionLevel: UserRole.GUEST,
      banStatus: BanStatus.NONE,
      punishmentCount: 0,
      nameOverride: 0,
      avatarOverride: 0,
      staffDivisions: [] as { name: string; region: string }[],
    },
    currentTeams: [],
    teamHistory: [],
    tournaments: [],
    fightNights: [],
    achievements: [],
    current1v1Entry: null,
    entries1v1: [],
  };
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
}) {
  const { search, permissionLevel, banStatus, page = 1, pageSize = 20 } = options;

  const where: any = {};

  // Search filter
  if (search && search.trim().length > 0) {
    where.OR = [
      { steamUsername: { contains: search, mode: 'insensitive' } },
      { steamId: { contains: search } },
    ];
  }

  // Permission level filter
  if (permissionLevel && permissionLevel !== 'all') {
    where.permissionLevel = permissionLevel;
  }

  // Ban status filter
  if (banStatus && banStatus !== 'all') {
    where.banStatus = banStatus;
  }

  return await prisma.user.findMany({
    where,
    include: {
      discord: true,
      staffAssignments: {
        include: staffAssignmentInclude,
      },
    },
    orderBy: [{ steamUsername: 'asc' }, { steamId: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

/**
 * Count users with optional filtering
 */
export async function countUsers(options: {
  search?: string;
  permissionLevel?: string;
  banStatus?: string;
}) {
  const { search, permissionLevel, banStatus } = options;

  const where: any = {};

  // Search filter
  if (search && search.trim().length > 0) {
    where.OR = [
      { steamUsername: { contains: search, mode: 'insensitive' } },
      { steamId: { contains: search } },
    ];
  }

  // Permission level filter
  if (permissionLevel && permissionLevel !== 'all') {
    where.permissionLevel = permissionLevel;
  }

  // Ban status filter
  if (banStatus && banStatus !== 'all') {
    where.banStatus = banStatus;
  }

  return await prisma.user.count({ where });
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
    staffAssignments?: StaffAssignmentPair[];
  },
) {
  const user = await prisma.user.findUnique({
    where: { steamId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const updateData: any = {};

  if (data.permissionLevel !== undefined) {
    updateData.permissionLevel = data.permissionLevel;
  }

  if (data.banStatus !== undefined) {
    updateData.banStatus = data.banStatus;
  }

  if (data.nameOverride !== undefined) {
    updateData.nameOverride = data.nameOverride;
  }

  const permissionChanged =
    data.permissionLevel !== undefined && data.permissionLevel !== user.permissionLevel;
  const banChanged = data.banStatus !== undefined && data.banStatus !== user.banStatus;
  if (permissionChanged || banChanged) {
    updateData.sessionVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { steamId },
    data: updateData,
  });

  if (data.staffAssignments !== undefined) {
    await replaceStaffAssignments(steamId, data.staffAssignments);
  }

  if (permissionChanged || banChanged) {
    invalidateCachedSessionVersion(steamId);
  }

  return updated;
}

/**
 * Ban a user with a reason
 */
/**
 * Clear a user's punishment status and deactivate active punishment records
 */
export async function clearPunishment(steamId: string, clearedBy: string) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  void clearedBy;

  await prisma.user.update({
    where: { steamId },
    data: {
      banStatus: 'NONE',
      sessionVersion: { increment: 1 },
    },
  });

  // Deactivate all active punishment records
  await prisma.punishment.updateMany({
    where: { playerSteamId: steamId, status: 1 },
    data: { status: 0 },
  });

  invalidateCachedSessionVersion(steamId);
}

export async function banUser(
  steamId: string,
  bannedBy: string,
  severity: 'WARNING' | 'SUSPENDED' | 'BANNED',
  reason: string,
  duration?: number,
) {
  await prisma.user.update({
    where: { steamId },
    data: {
      banStatus: severity,
      sessionVersion: { increment: 1 },
    },
  });

  invalidateCachedSessionVersion(steamId);

  // Create punishment record
  return await prisma.punishment.create({
    data: {
      playerSteamId: steamId,
      punishedBy: bannedBy,
      severity,
      reason,
      duration,
      startDateTime: new Date(),
      status: 1, // Active
    },
  });
}

/**
 * Admin: set a custom display name and lock it (prevents Steam auto-sync)
 */
export async function lockUserName(steamId: string, newName: string) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');

  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > 64) {
    throw new Error('Name must be between 1 and 64 characters');
  }

  return await prisma.user.update({
    where: { steamId },
    data: {
      steamUsername: trimmed,
      nameOverride: 1,
    },
  });
}

/**
 * Admin: unlock a user's name and immediately sync from Steam
 */
export async function unlockUserName(steamId: string) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');

  const steamProfile = await fetchSteamProfile(steamId);

  return await prisma.user.update({
    where: { steamId },
    data: {
      nameOverride: 0,
      ...(steamProfile && {
        steamUsername: steamProfile.personaname,
        steamAvatar: steamProfile.avatarfull,
      }),
    },
  });
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
export async function lockUserAvatar(steamId: string, avatarUrl: string) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');

  const trimmed = avatarUrl.trim();
  if (!trimmed) {
    throw new Error('Avatar URL is required');
  }

  // Avatars are rendered in <img src> — only allow https (and http for local fixtures)
  if (!isSafeUrl(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')) {
    throw new Error('Avatar URL must be an http(s) URL');
  }
  const protocol = new URL(trimmed).protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error('Avatar URL must be an http(s) URL');
  }

  return await prisma.user.update({
    where: { steamId },
    data: {
      steamAvatar: trimmed,
      avatarOverride: 1,
    },
  });
}

/**
 * Admin: unlock a user's avatar and immediately sync from Steam
 */
export async function unlockUserAvatar(steamId: string) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');

  const steamProfile = await fetchSteamProfile(steamId);

  return await prisma.user.update({
    where: { steamId },
    data: {
      avatarOverride: 0,
      ...(steamProfile && {
        steamAvatar: steamProfile.avatarfull,
      }),
    },
  });
}

/**
 * Unlink a user's Discord account
 * Can be used by the user themselves or by an admin
 */
export async function unlinkDiscord(steamId: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    include: { discord: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.discord) {
    throw new Error('No Discord account linked');
  }

  await prisma.discord.delete({
    where: { discordId: user.discord.discordId },
  });

  return { success: true };
}

/**
 * Get all users for public listing with pagination
 * Used by /users page
 */
export async function getUsersPublic(page: number = 1, search?: string, role?: string) {
  const USERS_PER_PAGE = 50;
  const skip = (page - 1) * USERS_PER_PAGE;

  const where: any = {};

  if (search && search.trim().length > 0) {
    where.OR = [
      { steamUsername: { contains: search, mode: 'insensitive' } },
      { steamId: { contains: search, mode: 'insensitive' } },
      {
        discord: { discordUsername: { contains: search, mode: 'insensitive' } },
      },
    ];
  }

  if (role && role !== 'all' && role !== '') {
    where.permissionLevel = role;
  }

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        steamId: true,
        steamUsername: true,
        steamAvatar: true,
        permissionLevel: true,
        banStatus: true,
        discord: {
          select: {
            discordUsername: true,
          },
        },
      },
      orderBy: {
        steamUsername: 'asc',
      },
      skip,
      take: USERS_PER_PAGE,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / USERS_PER_PAGE);

  return {
    users,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      perPage: USERS_PER_PAGE,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
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

  const existingUser = await prisma.user.findUnique({
    where: { steamId: steamid },
    select: {
      steamId: true,
      steamUsername: true,
      steamAvatar: true,
      permissionLevel: true,
      banStatus: true,
      sessionVersion: true,
      nameOverride: true,
      avatarOverride: true,
    },
  });

  if (!existingUser) {
    const created = await prisma.user.upsert({
      where: { steamId: steamid },
      create: {
        steamId: steamid,
        steamUsername: personaname,
        steamAvatar: avatarfull,
        permissionLevel: 'GUEST',
      },
      update: {},
      select: {
        steamUsername: true,
        steamAvatar: true,
        permissionLevel: true,
        banStatus: true,
        sessionVersion: true,
        nameOverride: true,
        avatarOverride: true,
      },
    });

    const wasRace = created.permissionLevel !== 'GUEST' || created.nameOverride === 1;
    if (wasRace) {
      const username = created.nameOverride ? created.steamUsername : personaname;
      const avatar = created.avatarOverride ? (created.steamAvatar ?? avatarfull) : avatarfull;
      return {
        username,
        avatar,
        permissionLevel: created.permissionLevel as string,
        banStatus: created.banStatus as string,
        sessionVersion: created.sessionVersion,
        isNewUser: false,
      };
    }

    return {
      username: personaname,
      avatar: avatarfull,
      permissionLevel: 'GUEST',
      banStatus: 'NONE',
      sessionVersion: 0,
      isNewUser: true,
    };
  }

  const username = existingUser.nameOverride ? existingUser.steamUsername : personaname;
  const avatar = existingUser.avatarOverride
    ? (existingUser.steamAvatar ?? avatarfull)
    : avatarfull;

  const updateData: Record<string, string> = {};
  if (!existingUser.nameOverride && existingUser.steamUsername !== username) {
    updateData.steamUsername = username;
  }
  if (!existingUser.avatarOverride && existingUser.steamAvatar !== avatar) {
    updateData.steamAvatar = avatar;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({ where: { steamId: steamid }, data: updateData });
  }

  return {
    username,
    avatar,
    permissionLevel: existingUser.permissionLevel as string,
    banStatus: existingUser.banStatus as string,
    sessionVersion: existingUser.sessionVersion,
    isNewUser: false,
  };
}

/**
 * Upsert a user for non-production test login.
 * Sets the requested role and clears ban status so E2E fixtures are deterministic.
 */
export async function upsertTestLoginUser(params: {
  steamId: string;
  username: string;
  role: 'GUEST' | 'MODERATOR' | 'ADMIN';
}) {
  const avatar =
    'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

  return prisma.user.upsert({
    where: { steamId: params.steamId },
    create: {
      steamId: params.steamId,
      steamUsername: params.username,
      steamAvatar: avatar,
      permissionLevel: params.role,
      banStatus: 'NONE',
    },
    update: {
      steamUsername: params.username,
      permissionLevel: params.role,
      banStatus: 'NONE',
    },
    select: {
      steamId: true,
      steamUsername: true,
      steamAvatar: true,
      permissionLevel: true,
      banStatus: true,
      sessionVersion: true,
    },
  });
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
  const existingByDiscord = await prisma.discord.findUnique({ where: { discordId } });
  if (existingByDiscord?.playerSteamId && existingByDiscord.playerSteamId !== steamId) {
    conflict('This Discord account is already linked to another user');
  }

  const existingBySteam = await prisma.discord.findUnique({ where: { playerSteamId: steamId } });
  if (existingBySteam && existingBySteam.discordId !== discordId) {
    // User is re-linking to a different Discord — drop the old association first
    await prisma.discord.delete({ where: { discordId: existingBySteam.discordId } });
  }

  await prisma.discord.upsert({
    where: { discordId },
    create: { discordId, discordUsername, discordAvatar, playerSteamId: steamId },
    update: { discordUsername, discordAvatar, playerSteamId: steamId },
  });
}
