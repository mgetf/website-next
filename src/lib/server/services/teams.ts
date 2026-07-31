/**
 * Team Service
 *
 * All team-related business logic and database operations.
 */

import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { notFound, badRequest, forbidden } from '$lib/server/utils/errors';
import { createNotificationForUser } from '$lib/server/services/notifications';
import { TeamStatus, NotificationType } from '$lib/types/enums';
import type {
  TeamListRow,
  PublicTeamRow,
  StandingsTeamRow,
  Homepage1v1Entry,
  TeamAuditSnapshot,
  TeamMatchHistoryRow,
  PaginationInfo,
} from '$lib/types/service-models';

/**
 * Get teams with filtering, search, and pagination
 * Used by admin teams page
 */
export async function getTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
  formatId?: number;
  paymentStatus?: number;
  page?: number;
  pageSize?: number;
}): Promise<TeamListRow[]> {
  void options;
  return [];
}

/**
 * Get teams for public listing with pagination
 */
export async function getTeamsPublic(
  page: number = 1,
  search?: string,
  regionId?: number,
  seasonId?: number,
): Promise<{ teams: PublicTeamRow[]; pagination: PaginationInfo }> {
  void page;
  void search;
  void regionId;
  void seasonId;
  return {
    teams: [],
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
 * Count teams with filters
 * Used for pagination
 */
export async function countTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
  formatId?: number;
  paymentStatus?: number;
}) {
  return 0;
}

/**
 * Get teams for standings/league view
 * Returns teams with calculated stats
 */
export async function getTeamsForStandings(options: {
  seasonId?: number;
  regionId?: number;
  divisionId?: number;
  statuses?: TeamStatus[];
  limit?: number;
}): Promise<StandingsTeamRow[]> {
  void options;
  return [];
}

/**
 * Get teams by division for league standings
 * Returns teams with calculated average points
 */
export async function getTeamsByDivision(
  divisionId: number,
  seasonId: number,
  regionId: number,
  statuses: string[],
) {
  if (isRamaBackend()) {
    const { createTeamsClient, getTeamIdsBySeason } = await import('$lib/server/rama/teams');
    const idsByStatus = await getTeamIdsBySeason(
      createTeamsClient(ramaClientOpts()),
      String(seasonId),
    );
    const statusSet = new Set(statuses);
    const teams = [];
    for (const [teamId, status] of Object.entries(idsByStatus)) {
      if (!statusSet.has(status)) continue;
      const team = await getTeamByIdRama(Number(teamId));
      if (!team) continue;
      if (team.regionId !== regionId || team.divisionId !== divisionId) continue;

      const totalGames = team.gamesWon + team.gamesLost;
      const avgPoints = totalGames > 0 ? team.pointsScored / totalGames : 0;
      teams.push({
        id: team.id,
        name: team.name,
        acronym: team.acronym,
        avatar: team.avatar,
        status: team.status,
        wins: team.wins,
        losses: team.losses,
        points: parseFloat(avgPoints.toFixed(1)),
        paymentStatus: team.paymentStatus,
        players: team.players.map((p) => ({
          playerSteamId: p.playerSteamId,
          player: {
            steamId: p.player.steamId,
            steamUsername: p.player.steamUsername,
          },
        })),
        _sortKey: avgPoints,
      });
    }
    return teams.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b._sortKey - a._sortKey;
    });
  }
  throw new Error('getTeamsByDivision requires DATA_BACKEND=rama');
}

/**
 * Get a single team by ID
 */
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

async function getTeamByIdRama(id: number) {
  const opts = ramaClientOpts();
  const teamsClient = (await import('$lib/server/rama/teams')).createTeamsClient(opts);
  const { getTeam, getRoster } = await import('$lib/server/rama/teams');
  const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
  const { createCatalogClient, getRegion } = await import('$lib/server/rama/catalog');
  const { createSeasonsClient, getSeason } = await import('$lib/server/rama/seasons');
  const { createUsersClient, getUser } = await import('$lib/server/rama/users');

  const teamId = String(id);
  const row = await getTeam(teamsClient, teamId);
  if (!row) return null;

  const roster = await getRoster(teamsClient, teamId);
  const usersClient = createUsersClient(opts);
  const players = [];
  for (const [steamId, member] of Object.entries(roster)) {
    const user = await getUser(usersClient, steamId);
    players.push({
      playerSteamId: steamId,
      teamId: id,
      active: member.active ? 1 : 0,
      permissionLevel: permToInt(member.permissionLevel),
      paymentStatus: paymentToInt(member.paymentStatus),
      startedAt: new Date(0),
      leftAt: null,
      player: {
        steamId,
        steamUsername: String(user?.username ?? steamId),
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

  const { createMatchClient, getTeamStats } = await import('$lib/server/rama/match');
  const stats = await getTeamStats(createMatchClient(opts), teamId);

  return {
    id,
    name: String(row.name ?? ''),
    acronym: String(row.acronym ?? '') || null,
    formatId: Number(row.formatId),
    seasonId: Number.isFinite(seasonId) ? seasonId : null,
    divisionId: Number.isFinite(divisionId) ? divisionId : null,
    regionId: Number.isFinite(regionId) ? regionId : null,
    status: String(row.status ?? 'UNREADY') as TeamStatus,
    createdBy: String(row.createdBy ?? ''),
    joinPassword: String(row.joinPassword ?? ''),
    paymentStatus: 0,
    avatar: null,
    wins: stats.wins,
    losses: stats.losses,
    gamesWon: stats.wins,
    gamesLost: stats.losses,
    pointsScored: stats.points,
    pointsScoredAgainst: 0,
    createdAt: new Date(0),
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
    homeMatches: [] as TeamMatchHistoryRow[],
    awayMatches: [] as TeamMatchHistoryRow[],
    _count: {
      players: players.length,
      homeMatches: 0,
      awayMatches: 0,
    },
  };
}

export async function getTeamById(id: number) {
  if (isRamaBackend()) return getTeamByIdRama(id);
  throw new Error('getTeamById requires DATA_BACKEND=rama');
}

/**
 * Get a compact team snapshot for audit metadata.
 */
export async function getTeamAuditSnapshot(id: number): Promise<TeamAuditSnapshot | null> {
  if (isRamaBackend()) {
    void id;
    return null;
  }
  throw new Error('getTeamAuditSnapshot requires DATA_BACKEND=rama');
}

/**
 * Update team metadata (name, acronym, seasonId, regionId).
 * Does NOT handle status or division changes — use adminSetTeamStatus() and
 * changeTeamDivision() for those, as they carry payment side-effects.
 */
export async function updateTeam(
  id: number,
  data: {
    name: string;
    acronym?: string | null;
    seasonId?: number | null;
    regionId?: number | null;
  },
) {
  throw new Error('updateTeam is not available under Rama');
}

/**
 * Set a team's status with payment enforcement (admin action).
 *
 * Setting to READY is hard-blocked for paid divisions unless all required
 * players already have a non-zero paymentStatus. Admins must use the
 * "Mark as paid" action first.
 */
export async function adminSetTeamStatus(id: number, status: TeamStatus) {
  if (isRamaBackend()) {
    const team = await getTeamByIdRama(id);
    if (!team) notFound('Team not found');

    if (status === TeamStatus.READY || status === TeamStatus.PENDING) {
      const isFreeDiv = !team.division || team.division.signupCost === 0;
      if (!isFreeDiv) {
        const paidCount = team.players.filter(
          (p) => p.active === 1 && p.paymentStatus !== 0,
        ).length;
        if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
          badRequest(
            `Cannot set team to ${status}: at least ${MIN_PAID_PLAYERS_TO_READY} active players must be marked as paid first`,
          );
        }
      }
    }

    const { createTeamsClient, setTeamStatus } = await import('$lib/server/rama/teams');
    const ack = await setTeamStatus(createTeamsClient(ramaClientOpts()), {
      teamId: String(id),
      status: status as 'UNREADY' | 'PENDING' | 'READY' | 'DEAD' | 'PLACEMENT',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to set status');
    return { id, status };
  }
  throw new Error('adminSetTeamStatus requires DATA_BACKEND=rama');
}

const MIN_PAID_PLAYERS_TO_READY = 2;

/**
 * Toggle a team from UNREADY to PENDING.
 * Requires the caller to be a team admin (permissionLevel >= 1)
 * and at least MIN_PAID_PLAYERS_TO_READY active players to be paid.
 */
export async function toggleTeamReady(teamId: number, userSteamId: string) {
  if (isRamaBackend()) {
    const team = await getTeamByIdRama(teamId);
    if (!team) notFound('Team not found');

    const caller = team.players.find((p) => p.playerSteamId === userSteamId && p.active === 1);
    if (!caller || caller.permissionLevel < 1) {
      forbidden('Only team admins can toggle ready');
    }

    if (team.status !== TeamStatus.UNREADY) {
      badRequest('Team must be in UNREADY status to toggle ready');
    }

    const isFreeDiv = !team.division || team.division.signupCost === 0;
    if (!isFreeDiv) {
      const paidCount = team.players.filter((p) => p.active === 1 && p.paymentStatus !== 0).length;
      if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
        badRequest(`At least ${MIN_PAID_PLAYERS_TO_READY} players must be paid before readying up`);
      }
    }

    const { createTeamsClient, setTeamStatus } = await import('$lib/server/rama/teams');
    const ack = await setTeamStatus(createTeamsClient(ramaClientOpts()), {
      teamId: String(teamId),
      status: 'PENDING',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to ready up');
    return { id: teamId, status: TeamStatus.PENDING };
  }
  throw new Error('toggleTeamReady requires DATA_BACKEND=rama');
}

export interface ChangeTeamDivisionResult {
  oldDivision: { id: number; name: string; signupCost: number } | null;
  newDivision: { id: number; name: string; signupCost: number };
  paymentStatusReset: boolean;
  statusReset: boolean;
  notifiedPlayerSteamIds: string[];
}

/**
 * Change a team's division with payment status side-effects.
 *
 * Free → Paid:  resets paymentStatus to 0 for all active players and the team.
 * Paid → Free:  marks all active players and the team as paid (1), and sends
 *               a refund-eligibility notification to any players who had already paid.
 * Same tier:    no payment changes.
 */
export async function changeTeamDivision(
  teamId: number,
  newDivisionId: number,
  adminSteamId: string,
): Promise<ChangeTeamDivisionResult> {
  throw new Error('changeTeamDivision is not available under Rama');
}

/**
 * Find the most recent season that has teams with specific statuses
 * Used to find default season for league pages
 */
export async function findRecentSeasonWithTeams(statuses: string[], formatId?: number) {
  if (isRamaBackend()) {
    const { createSeasonsClient, getSeasonIds, getSeason } =
      await import('$lib/server/rama/seasons');
    const { createTeamsClient, getTeamIdsBySeason } = await import('$lib/server/rama/teams');
    const opts = ramaClientOpts();
    const seasonsClient = createSeasonsClient(opts);
    const teamsClient = createTeamsClient(opts);
    const statusSet = new Set(statuses);
    const seasonIds = (await getSeasonIds(seasonsClient))
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a);
    for (const seasonId of seasonIds) {
      const season = await getSeason(seasonsClient, String(seasonId));
      if (!season) continue;
      if (formatId !== undefined && Number(season.formatId) !== formatId) continue;
      const idsByStatus = await getTeamIdsBySeason(teamsClient, String(seasonId));
      const hasVisible = Object.values(idsByStatus).some((s) => statusSet.has(s));
      if (!hasVisible) continue;
      return {
        seasonId,
        regionId: Number(season.regionId),
      };
    }
    return null;
  }
  throw new Error('findRecentSeasonWithTeams requires DATA_BACKEND=rama');
}

/**
 * Get top 1v1 entries for the homepage card
 * Includes player steamId for profile links
 */
export async function getTop1v1EntriesForHomepage(options: {
  seasonId: number;
  divisionId: number;
  limit?: number;
  statuses?: string[];
}): Promise<Homepage1v1Entry[]> {
  void options;
  return [];
}

/**
 * Get the team name a player is currently on for a given format and set of season IDs
 * Returns empty string if not found
 */
export async function getPlayerCurrentTeamName(
  steamId: string,
  formatId: number,
  seasonIds: number[],
): Promise<string> {
  void steamId;
  void formatId;
  void seasonIds;
  return '';
}

/**
 * Find the most recent season that has 1v1 entries with the given statuses
 * Returns { seasonId, regionId } or null if none found
 */
export async function findRecent1v1SeasonWithEntries(
  statuses: string[],
  formatId: number,
): Promise<{ seasonId: number; regionId: number } | null> {
  void statuses;
  void formatId;
  return null;
}

/**
 * Get team format and player list for format-based redirect checks
 * Returns null if team not found
 */
export async function getTeamFormatCheck(teamId: number) {
  if (isRamaBackend()) {
    const { createTeamsClient, getTeam, getRoster } = await import('$lib/server/rama/teams');
    const client = createTeamsClient(ramaClientOpts());
    const team = await getTeam(client, String(teamId));
    if (!team) return null;
    const roster = await getRoster(client, String(teamId));
    return {
      formatId: Number(team.formatId),
      players: Object.entries(roster).map(([playerSteamId, m]) => ({
        playerSteamId,
        active: m.active ? 1 : 0,
      })),
    };
  }
  throw new Error('getTeamFormatCheck requires DATA_BACKEND=rama');
}

/**
 * Helper: Calculate standings stats for a team
 */
export function calculateStandingsStats(team: {
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsScored: number;
  pointsScoredAgainst: number;
}) {
  const totalGames = team.gamesWon + team.gamesLost;
  const ppg = totalGames > 0 ? (team.pointsScored / totalGames).toFixed(1) : '0.0';
  const winRate =
    team.wins + team.losses > 0
      ? ((team.wins / (team.wins + team.losses)) * 100).toFixed(1)
      : '0.0';

  return {
    pointsPerGame: parseFloat(ppg),
    winRate: parseFloat(winRate),
    record: `${team.wins}-${team.losses}`,
  };
}
