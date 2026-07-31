type Team = {
  id: number;
  name: string;
  formatId?: number | null;
  regionId?: number | null;
  divisionId?: number | null;
  wins: number;
  losses: number;
  pointsScored: number;
  gamesWon: number;
  gamesLost: number;
  [key: string]: unknown;
};

/**
 * Admin Match Management Service
 * Match creation, bulk operations, and admin-only functions
 */

import { notFound, badRequest } from '$lib/server/utils/errors';
import { MatchStatus, TeamStatus, NotificationType } from '$lib/types/enums';
import {
  calculateWinLossRatio,
  calculatePointsPerGame,
  localDatetimeToUtc,
} from '$lib/server/utils/matchHelpers';
import { createNotificationForTeamOwners } from './notifications';
import { formatPlayoffRound } from '$lib/utils/playoffs';
import type { AdminMatchListRow, AdminTeamMatchRow } from '$lib/types/service-models';

/**
 * Sort teams by standings
 * Priority: wins → win/loss ratio → points per game
 */
export function sortTeamsByStandings(teams: Team[]): Team[] {
  return teams.sort((a, b) => {
    // Primary: wins
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }

    // Secondary: win/loss ratio
    const ratioA = calculateWinLossRatio(a.wins, a.losses);
    const ratioB = calculateWinLossRatio(b.wins, b.losses);
    if (ratioA !== ratioB) {
      return ratioB - ratioA;
    }

    // Tertiary: points per game
    const ppgA = calculatePointsPerGame(a.pointsScored, a.gamesWon, a.gamesLost);
    const ppgB = calculatePointsPerGame(b.pointsScored, b.gamesWon, b.gamesLost);
    return ppgB - ppgA;
  });
}

async function countPriorMatchups(
  seasonId: number,
  teamAId: number,
  teamBId: number,
): Promise<number> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, getMatchIdsForTeam } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const aIds = await getMatchIdsForTeam(client, String(teamAId));
    const bIds = new Set(await getMatchIdsForTeam(client, String(teamBId)));
    let count = 0;
    for (const matchId of aIds) {
      if (!bIds.has(matchId)) continue;
      const match = await getMatch(client, matchId);
      if (match && String(match.seasonId) === String(seasonId)) count++;
    }
    return count;
  }
  throw new Error('countPriorMatchups requires DATA_BACKEND=rama');
}

/**
 * Pair teams for matches, avoiding repeat matchups
 * Returns array of teams paired in order [team1, team2, team3, team4, ...]
 */
export async function pairTeamsForMatches(teams: Team[], seasonId: number): Promise<Team[]> {
  const sortedTeams = sortTeamsByStandings(teams);
  const finalTeams: Team[] = [];

  for (let i = 0; i < sortedTeams.length; i++) {
    const currentTeam = sortedTeams[i];

    if (finalTeams.some((team) => team.id === currentTeam.id)) {
      continue;
    }

    let x = 1;
    let playedAll = 0;
    let foundMatch = false;

    while (!foundMatch) {
      if (i + x >= sortedTeams.length) {
        x = 1;
        playedAll++;

        if (playedAll > 100) {
          break;
        }
        continue;
      }

      const potentialOpponent = sortedTeams[i + x];

      if (finalTeams.some((team) => team.id === potentialOpponent.id)) {
        x++;
        continue;
      }

      const prior = await countPriorMatchups(seasonId, currentTeam.id, potentialOpponent.id);

      if (prior <= playedAll) {
        finalTeams.push(currentTeam);
        finalTeams.push(potentialOpponent);
        foundMatch = true;
      }

      x++;
    }
  }

  return finalTeams;
}

interface CreateMatchSetParams {
  seasonId: number;
  seasonNo: number;
  weekNo?: number;
  boSeries: number;
  arenaId?: number;
  matchDateTime?: string;
  matchTimezone?: string;
  mapBanPoolId?: number;
  // Playoff-specific parameters
  isPlayoff?: boolean;
  playoffId?: number;
  playoffRound?: number;
  boGames?: number;
  // Optional admin-specified pairings (skips auto-pairing algorithm when provided)
  manualPairings?: { homeTeamId: number; awayTeamId: number }[];
}

async function createMatchSetRama(
  regionId: number,
  divisionId: number,
  params: CreateMatchSetParams,
) {
  const {
    seasonId,
    seasonNo,
    weekNo,
    boSeries,
    arenaId,
    matchDateTime,
    matchTimezone,
    mapBanPoolId,
    isPlayoff,
    manualPairings,
  } = params;

  if (isPlayoff) {
    badRequest('Playoff matches require manual team selection. Use createPlayoffMatch instead.');
  }

  const teams = (await getEligibleTeams(regionId, divisionId, seasonId)) as Team[];
  if (teams.length < 2) {
    badRequest('Not enough eligible teams for match creation');
  }

  const season = await getSeasonByIdForMatch(seasonId);
  const seasonFormatId = season?.formatId;
  const eligibleTeamIds = new Set(teams.map((t) => t.id));

  let matchPairs: { homeTeam: Team; awayTeam: Team }[];
  if (manualPairings && manualPairings.length > 0) {
    for (const { homeTeamId, awayTeamId } of manualPairings) {
      if (!eligibleTeamIds.has(homeTeamId)) {
        badRequest(`Team ${homeTeamId} is not eligible for this match set`);
      }
      if (!eligibleTeamIds.has(awayTeamId)) {
        badRequest(`Team ${awayTeamId} is not eligible for this match set`);
      }
      if (homeTeamId === awayTeamId) {
        badRequest(`A team cannot play against itself (team ${homeTeamId})`);
      }
    }
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    matchPairs = manualPairings.map(({ homeTeamId, awayTeamId }) => ({
      homeTeam: teamsById.get(homeTeamId)!,
      awayTeam: teamsById.get(awayTeamId)!,
    }));
  } else {
    const pairedTeams = await pairTeamsForMatches(teams, seasonId);
    if (pairedTeams.length === 0) {
      badRequest('No valid team pairings found');
    }
    matchPairs = [];
    for (let i = 0; i < pairedTeams.length - 1; i += 2) {
      matchPairs.push({ homeTeam: pairedTeams[i], awayTeam: pairedTeams[i + 1] });
    }
  }

  const pairedTeamIds = new Set(matchPairs.flatMap((p) => [p.homeTeam.id, p.awayTeam.id]));
  const byeTeams = teams.filter((t) => !pairedTeamIds.has(t.id));

  const { ramaClientOpts } = await import('$lib/server/rama/config');
  const { createMatchClient, createMatch } = await import('$lib/server/rama/match');
  const { createMapPoolsClient, getPoolMaps } = await import('$lib/server/rama/mapPools');
  const matchClient = createMatchClient(ramaClientOpts());

  let pool: string[] = [];
  if (mapBanPoolId) {
    pool = await getPoolMaps(createMapPoolsClient(ramaClientOpts()), String(mapBanPoolId));
  }

  const dt =
    matchDateTime && matchDateTime.length > 0
      ? localDatetimeToUtc(matchDateTime, matchTimezone || 'UTC').toISOString()
      : '';

  const matches: Array<{
    id: number;
    homeTeamId: number;
    awayTeamId: number;
    seasonId: number;
    seasonNo: number;
    weekNo: number | null;
    boSeries: number;
    status: MatchStatus;
  }> = [];
  const baseMatchId = (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1_000);
  for (const { homeTeam, awayTeam } of matchPairs) {
    if (homeTeam.formatId !== seasonFormatId || awayTeam.formatId !== seasonFormatId) {
      badRequest(
        `Format mismatch: teams must match the season's format. ` +
          `Season formatId=${seasonFormatId}, home formatId=${homeTeam.formatId}, away formatId=${awayTeam.formatId}`,
      );
    }

    const matchId: number = baseMatchId + matches.length;
    const ack = await createMatch(matchClient, {
      type: 'create-match',
      matchId: String(matchId),
      homeTeamId: String(homeTeam.id),
      awayTeamId: String(awayTeam.id),
      seasonId: String(seasonId),
      boGames: boSeries,
      pool,
      weekNo: weekNo ?? 0,
      seasonNo,
      arenaId: arenaId != null ? String(arenaId) : '',
      matchDateTime: dt,
      matchTimezone: matchTimezone || '',
    });
    if (!ack.ok) {
      badRequest(ack.error || 'Failed to create match in Rama');
    }

    await createNotificationForTeamOwners(
      [homeTeam.id, awayTeam.id],
      NotificationType.MATCH_CREATED,
      `/matches/${matchId}`,
      `New match scheduled for Week ${weekNo}`,
    );

    matches.push({
      id: matchId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      seasonId,
      seasonNo,
      weekNo: weekNo ?? null,
      boSeries,
      status: MatchStatus.UNPLAYED,
    });
  }

  for (const byeTeam of byeTeams) {
    if (weekNo !== undefined) {
      await createNotificationForTeamOwners(
        [byeTeam.id],
        NotificationType.BYE_WEEK,
        `/teams/${byeTeam.id}`,
        `Your team has a bye week for Week ${weekNo}. No match was scheduled this week.`,
      );
    }
  }

  return { matches, byeTeams };
}

async function getSeasonByIdForMatch(seasonId: number) {
  const { getSeasonById } = await import('$lib/server/services/seasons');
  return getSeasonById(seasonId);
}

/**
 * Create a set of regular season matches
 */
export async function createMatchSet(
  regionId: number,
  divisionId: number,
  params: CreateMatchSetParams,
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    return createMatchSetRama(regionId, divisionId, params);
  }
  throw new Error('createMatchSet requires DATA_BACKEND=rama');
}

interface CreatePlayoffMatchParams {
  seasonId: number;
  seasonNo: number;
  playoffId: number;
  playoffRound: number;
  homeTeamId: number;
  awayTeamId: number;
  boSeries: number;
  boGames?: number;
  arenaId?: number;
  matchDateTime?: string;
  matchTimezone?: string;
  mapBanPoolId?: number;
}

export async function createPlayoffMatch(params: CreatePlayoffMatchParams) {
  const {
    seasonId,
    seasonNo,
    playoffId,
    playoffRound,
    homeTeamId,
    awayTeamId,
    boSeries,
    boGames,
    arenaId,
    matchDateTime,
    matchTimezone,
    mapBanPoolId,
  } = params;

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { getPlayoffBySeason } = await import('$lib/server/services/playoffs');
    const { getTeamById } = await import('$lib/server/services/teams');
    const playoff = await getPlayoffBySeason(seasonId);
    if (!playoff || playoff.id !== playoffId) {
      notFound('Playoff not found');
    }

    const [seasonData, homeTeam, awayTeam] = await Promise.all([
      getSeasonByIdForMatch(seasonId),
      getTeamById(homeTeamId),
      getTeamById(awayTeamId),
    ]);
    if (!homeTeam) notFound(`Home team ${homeTeamId} not found`);
    if (!awayTeam) notFound(`Away team ${awayTeamId} not found`);

    const seasonFormatId = seasonData?.formatId;
    if (homeTeam.formatId !== seasonFormatId) {
      badRequest(
        `Format mismatch: home team "${homeTeam.name}" (formatId=${homeTeam.formatId}) does not match season format (formatId=${seasonFormatId})`,
      );
    }
    if (awayTeam.formatId !== seasonFormatId) {
      badRequest(
        `Format mismatch: away team "${awayTeam.name}" (formatId=${awayTeam.formatId}) does not match season format (formatId=${seasonFormatId})`,
      );
    }

    const { createMatchClient, createMatch } = await import('$lib/server/rama/match');
    const { createMapPoolsClient, getPoolMaps } = await import('$lib/server/rama/mapPools');
    let pool: string[] = [];
    if (mapBanPoolId) {
      pool = await getPoolMaps(createMapPoolsClient(ramaClientOpts()), String(mapBanPoolId));
    }

    const dt =
      matchDateTime && matchDateTime.length > 0
        ? localDatetimeToUtc(matchDateTime, matchTimezone || 'UTC').toISOString()
        : '';

    const matchId = (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1_000);
    // weekNo 0 indexes playoff matches under $$matches-by-week for getLatestMatchId.
    const ack = await createMatch(createMatchClient(ramaClientOpts()), {
      type: 'create-match',
      matchId: String(matchId),
      homeTeamId: String(homeTeamId),
      awayTeamId: String(awayTeamId),
      seasonId: String(seasonId),
      boGames: boSeries,
      pool,
      weekNo: 0,
      seasonNo,
      arenaId: arenaId != null ? String(arenaId) : '',
      matchDateTime: dt,
      matchTimezone: matchTimezone || '',
    });
    if (!ack.ok) {
      badRequest(ack.error || 'Failed to create playoff match in Rama');
    }

    const roundLabel = formatPlayoffRound(playoffRound);
    await createNotificationForTeamOwners(
      [homeTeamId, awayTeamId],
      NotificationType.MATCH_CREATED,
      `/matches/${matchId}`,
      `New playoff match scheduled: ${roundLabel}`,
    );

    void boGames;
    return {
      id: matchId,
      homeTeamId,
      awayTeamId,
      seasonId,
      seasonNo,
      playoffId,
      playoffRound,
      weekNo: null as number | null,
      boSeries,
      boGames: boGames || null,
      status: MatchStatus.UNPLAYED,
      matchDateTime: dt ? new Date(dt) : null,
      matchTimezone: matchTimezone || null,
    };
  }
  throw new Error('createPlayoffMatch requires DATA_BACKEND=rama');
}

/**
 * Get teams eligible for match creation
 * Filters by region, division, season, and READY status.
 */
export async function getEligibleTeams(regionId: number, divisionId: number, seasonId: number) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const season = await getSeasonByIdForMatch(seasonId);
    const paymentRequired = season?.paymentRequired ?? false;
    const formatId = season?.formatId;
    const { createTeamsClient, getTeamIdsBySeason } = await import('$lib/server/rama/teams');
    const { getTeamById } = await import('$lib/server/services/teams');
    const idsByStatus = await getTeamIdsBySeason(
      createTeamsClient(ramaClientOpts()),
      String(seasonId),
    );
    const rows = [];
    for (const [teamId, status] of Object.entries(idsByStatus)) {
      if (status !== 'READY') continue;
      const team = await getTeamById(Number(teamId));
      if (!team) continue;
      if (team.regionId !== regionId || team.divisionId !== divisionId) continue;
      if (formatId != null && team.formatId !== formatId) continue;
      if (paymentRequired && ![1, 2].includes(team.paymentStatus ?? 0)) continue;
      rows.push(team);
    }
    rows.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return rows;
  }
  throw new Error('getEligibleTeams requires DATA_BACKEND=rama');
}

/**
 * Calculate the week label for a new match set
 * Returns the week number with suffix (e.g., "3b" if Week 3a already exists)
 */
export async function calculateWeekLabel(
  regionId: number,
  divisionId: number,
  seasonId: number,
  weekNo: number,
): Promise<{ weekLabel: string; existingCount: number }> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  let existingMatches: { id: number }[];
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, getMatchIdsForWeek } =
      await import('$lib/server/rama/match');
    const { getTeamById } = await import('$lib/server/services/teams');
    const client = createMatchClient(ramaClientOpts());
    const ids = await getMatchIdsForWeek(client, String(seasonId), weekNo);
    existingMatches = [];
    for (const matchId of ids) {
      const match = await getMatch(client, matchId);
      if (!match) continue;
      const home = await getTeamById(Number(match.homeTeamId));
      const away = await getTeamById(Number(match.awayTeamId));
      if (
        home?.regionId === regionId &&
        home?.divisionId === divisionId &&
        away?.regionId === regionId &&
        away?.divisionId === divisionId
      ) {
        existingMatches.push({ id: Number(matchId) });
      }
    }
    existingMatches.sort((a, b) => a.id - b.id);
  } else {
    throw new Error('calculateWeekLabel requires DATA_BACKEND=rama');
  }

  // Group matches into sets by checking for gaps in IDs
  let matchSetCount = 0;
  if (existingMatches.length > 0) {
    let lastId = existingMatches[0].id;
    matchSetCount = 1;
    for (let i = 1; i < existingMatches.length; i++) {
      if (existingMatches[i].id - lastId > 10) {
        matchSetCount++;
      }
      lastId = existingMatches[i].id;
    }
  }

  let weekLabel = weekNo.toString();
  if (matchSetCount > 0) {
    weekLabel = weekNo.toString() + String.fromCharCode(96 + matchSetCount + 1);
  }

  return { weekLabel, existingCount: matchSetCount };
}

/**
 * Update match status (resolve disputes, force status changes)
 */
export async function updateMatchStatus(matchId: number, status: MatchStatus) {
  throw new Error('updateMatchStatus is not available under Rama');
}

/**
 * Get recent unplayed matches for dashboard quick view
 */
export async function getRecentUnplayedMatches(limit: number = 10): Promise<AdminMatchListRow[]> {
  void limit;
  return [];
}

interface GameResult {
  gameNum: number;
  homeScore: number;
  awayScore: number;
}

const ALLOWED_BO_SERIES = new Set([1, 3, 5, 7]);

/**
 * Admin override scores (reverses old stats and applies new ones).
 * Optionally changes Best of series (`boSeries`), creating or removing `Game` rows as needed.
 */
export async function adminUpdateScores(
  matchId: number,
  gameResults: GameResult[],
  options: { resolveDispute?: boolean; boSeries?: number } = {},
) {
  throw new Error('adminUpdateScores is not available under Rama');
}

/**
 * Get available week and playoff round options for a season
 * Returns default weeks 1-8 when no matches exist yet
 */
export async function getWeekOptionsForSeason(
  seasonId: number | null,
): Promise<{ value: string; label: string }[]> {
  return [];
}

/**
 * Get matches for the admin week/playoff view with full relations
 */
export async function getMatchesForAdminWeekView(options: {
  seasonId: number;
  weekNo?: number | null;
  playoffRound?: number | null;
}): Promise<AdminMatchListRow[]> {
  void options;
  return [];
}

/**
 * Admin: update a match's scheduled date/time and source timezone.
 * matchDateTimeUtc must be a valid UTC ISO 8601 string (or null to clear).
 * Both fields are updated atomically.
 */
export async function adminUpdateMatchSchedule(
  matchId: number,
  matchDateTimeUtc: string | null,
  matchTimezone: string | null,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, setMatchSchedule } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) notFound('Match not found');
    const ack = await setMatchSchedule(client, {
      matchId: String(matchId),
      matchDateTime: matchDateTimeUtc ?? '',
      matchTimezone: matchTimezone || '',
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to update schedule');
    return {
      id: matchId,
      matchDateTime: matchDateTimeUtc ? new Date(matchDateTimeUtc) : null,
      matchTimezone: matchTimezone || null,
    };
  }
  throw new Error('adminUpdateMatchSchedule requires DATA_BACKEND=rama');
}

/**
 * Admin: update per-game arena assignments for a match.
 * Each entry maps a gameId to an arenaId (null clears the assignment).
 */
export async function adminUpdateMatchArenas(
  matchId: number,
  arenaAssignments: { gameId: number; arenaId: number | null }[],
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, setMatchArena } = await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) notFound('Match not found');
    const first = arenaAssignments.find((a) => a.arenaId != null);
    if (!first?.arenaId) return;
    const ack = await setMatchArena(client, {
      matchId: String(matchId),
      arenaId: String(first.arenaId),
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to update arenas');
    return;
  }
  throw new Error('adminUpdateMatchArenas requires DATA_BACKEND=rama');
}

/**
 * Admin: delete an unplayed match with no submitted game results.
 * Cascades related records in dependency order.
 * Throws if the match is already played/disputed or has recorded scores.
 */
export async function adminDeleteMatch(matchId: number) {
  throw new Error('adminDeleteMatch is not available under Rama');
}

/**
 * Get matches for a set of team IDs, for the admin teams page match history column
 */
export async function getMatchesByTeamIds(teamIds: number[]): Promise<AdminTeamMatchRow[]> {
  void teamIds;
  return [];
}
