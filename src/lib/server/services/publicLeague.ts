/**
 * Public league read model for /api/v1.
 * Plain objects only: no join passwords, payments, Discord, or admin drafts.
 */

import { prisma } from '#lib/server/db.js';
import {
  PUBLIC_PAGE_SIZE,
  PublicNotFoundError,
  PublicQueryError,
  type DivisionFilterQuery,
  type MatchListQuery,
  type PublicMatchStatus,
  type PublicTeamStatus,
  type SeasonListQuery,
  type TeamListQuery,
} from '#lib/server/api/publicLeagueQuery.js';
import { seasonHasPlayedMatches } from '#lib/server/services/leagueMatches.js';
import { getGlobalSettings } from '#lib/server/services/settings.js';
import { scoresForLeagueMatch } from '#lib/utils/leagueMatches.js';
import {
  SIGNUP_LIST_STATUSES,
  compareStandingsTeams,
  listsLivingSignups,
  shouldShowOnLeagueDivision,
  withStandingsRanks,
} from '#lib/utils/standingsHighlight.js';
import { BanStatus, MatchStatus, TeamStatus, type Prisma } from '#prisma/client.js';

type Page<T> = {
  data: T[];
  page: { page: number; perPage: number; total: number; totalPages: number };
};

type PublicRef = { id: number; name: string };
type PublicFormat = { id: number; code: string; name: string };
type PublicPlayer = { steamId: string; name: string; avatar: string | null };

const TEAM_STATUS_ENUM: Record<PublicTeamStatus, TeamStatus> = {
  dead: TeamStatus.DEAD,
  unready: TeamStatus.UNREADY,
  pending: TeamStatus.PENDING,
  ready: TeamStatus.READY,
  placement: TeamStatus.PLACEMENT,
};

const MATCH_STATUS_ENUM: Record<PublicMatchStatus, MatchStatus> = {
  unplayed: MatchStatus.UNPLAYED,
  played: MatchStatus.PLAYED,
  dispute: MatchStatus.DISPUTE,
};

const rosterSelect = {
  where: { active: 1 },
  orderBy: { startedAt: 'asc' as const },
  select: {
    playerSteamId: true,
    player: { select: { steamUsername: true, steamAvatar: true } },
  },
} satisfies Prisma.PlayerInTeamFindManyArgs;

type RosterRow = {
  playerSteamId: string;
  player: { steamUsername: string; steamAvatar: string | null } | null;
};

function paged<T>(rows: T[], page: number, total: number): Page<T> {
  return {
    data: rows,
    page: {
      page,
      perPage: PUBLIC_PAGE_SIZE,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / PUBLIC_PAGE_SIZE),
    },
  };
}

function full<T>(rows: T[]): Page<T> {
  const total = rows.length;
  return {
    data: rows,
    page: {
      page: 1,
      perPage: total,
      total,
      totalPages: total === 0 ? 0 : 1,
    },
  };
}

function lower<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}

function toFormat(format: { id: number; code: string; name: string }): PublicFormat {
  return { id: format.id, code: format.code, name: format.name };
}

function toPlayers(rows: RosterRow[]): PublicPlayer[] {
  return rows.map((row) => ({
    steamId: row.playerSteamId,
    name: row.player?.steamUsername || 'Unknown',
    avatar: row.player?.steamAvatar ?? null,
  }));
}

function knownTeamStatuses(values: string[]): TeamStatus[] {
  const allowed = new Set<string>(Object.values(TeamStatus));
  return values.filter((value): value is TeamStatus => allowed.has(value));
}

const seasonSelect = {
  id: true,
  seasonNum: true,
  numWeeks: true,
  matchWeek: true,
  signupsOpen: true,
  rosterLocked: true,
  matchDeadline: true,
  regionId: true,
  formatId: true,
  region: { select: { id: true, name: true, hidden: true } },
  format: { select: { id: true, code: true, name: true, isIndividual: true } },
} satisfies Prisma.SeasonSelect;

type SeasonRow = Prisma.SeasonGetPayload<{ select: typeof seasonSelect }>;

function toSeason(season: SeasonRow) {
  return {
    id: season.id,
    number: season.seasonNum,
    weeks: season.numWeeks,
    matchWeek: season.matchWeek,
    signupsOpen: season.signupsOpen,
    rosterLocked: season.rosterLocked,
    matchDeadline: season.matchDeadline?.toISOString() ?? null,
    region: { id: season.region.id, name: season.region.name },
    format: toFormat(season.format),
  };
}

async function loadVisibleSeason(id: number): Promise<SeasonRow> {
  const season = await prisma.season.findUnique({ where: { id }, select: seasonSelect });
  if (!season || season.region.hidden !== 0) throw new PublicNotFoundError('Season not found');
  return season;
}

async function loadSeasonDivision(season: SeasonRow, divisionId: number): Promise<PublicRef> {
  const division = await prisma.division.findFirst({
    where: {
      id: divisionId,
      hidden: 0,
      regionId: season.regionId,
      formatId: season.formatId,
    },
    select: { id: true, name: true },
  });
  if (!division) throw new PublicNotFoundError('Division not found');
  return division;
}

async function resolveFormatId(code: string): Promise<number> {
  const format = await prisma.format.findUnique({ where: { code }, select: { id: true } });
  if (!format) throw new PublicQueryError(`Unknown format "${code}"`);
  return format.id;
}

export async function listPublicFormats(): Promise<Page<PublicFormat & { isIndividual: boolean }>> {
  const formats = await prisma.format.findMany({
    select: { id: true, code: true, name: true, isIndividual: true },
    orderBy: { id: 'asc' },
  });
  return full(formats);
}

export async function listPublicRegions(): Promise<Page<PublicRef>> {
  const regions = await prisma.region.findMany({
    where: { hidden: 0 },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  return full(regions);
}

export async function listPublicSeasons(query: SeasonListQuery) {
  const where: Prisma.SeasonWhereInput = { region: { hidden: 0 } };
  if (query.regionId != null) where.regionId = query.regionId;
  if (query.format != null) where.formatId = await resolveFormatId(query.format);
  if (query.current) where.activeSignupSeasons = { some: {} };

  const [total, rows] = await Promise.all([
    prisma.season.count({ where }),
    prisma.season.findMany({
      where,
      select: seasonSelect,
      orderBy: [{ seasonNum: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
    }),
  ]);

  return paged(rows.map(toSeason), query.page, total);
}

export async function getPublicSeason(id: number) {
  return toSeason(await loadVisibleSeason(id));
}

export async function listPublicSeasonDivisions(seasonId: number) {
  const season = await loadVisibleSeason(seasonId);
  const divisions = await prisma.division.findMany({
    where: { hidden: 0, regionId: season.regionId, formatId: season.formatId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  return full(
    divisions.map((division) => ({
      id: division.id,
      name: division.name,
      region: { id: season.region.id, name: season.region.name },
      format: toFormat(season.format),
    })),
  );
}

type StandingTeamRow = {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  status: TeamStatus;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsScored: number;
  pointsScoredAgainst: number;
  players: RosterRow[];
};

function averagePoints(
  team: Pick<StandingTeamRow, 'gamesWon' | 'gamesLost' | 'pointsScored'>,
): number {
  const totalGames = team.gamesWon + team.gamesLost;
  return totalGames > 0 ? Number((team.pointsScored / totalGames).toFixed(1)) : 0;
}

function toStandingTeam(team: StandingTeamRow) {
  return {
    id: team.id,
    name: team.name,
    acronym: team.acronym,
    avatar: team.avatar,
    status: lower(team.status),
    wins: team.wins,
    losses: team.losses,
    points: averagePoints(team),
    gamesWon: team.gamesWon,
    gamesLost: team.gamesLost,
    pointsScored: team.pointsScored,
    pointsScoredAgainst: team.pointsScoredAgainst,
    players: toPlayers(team.players),
  };
}

const standingSelect = {
  id: true,
  name: true,
  acronym: true,
  avatar: true,
  status: true,
  wins: true,
  losses: true,
  gamesWon: true,
  gamesLost: true,
  pointsScored: true,
  pointsScoredAgainst: true,
  players: rosterSelect,
} satisfies Prisma.TeamSelect;

async function standingsForDivision(
  seasonId: number,
  regionId: number,
  divisionId: number | null,
  statuses: TeamStatus[],
  livingSignups: boolean,
  assignRanks: boolean,
) {
  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      regionId,
      divisionId,
      status: { in: statuses },
    },
    select: standingSelect,
  });

  const visible = teams
    .map((team) => ({ team, points: averagePoints(team) }))
    .filter(({ team }) =>
      assignRanks
        ? shouldShowOnLeagueDivision(
            { status: team.status, wins: team.wins, losses: team.losses },
            livingSignups,
          )
        : team.status !== TeamStatus.DEAD || team.wins + team.losses > 0,
    )
    .sort(
      (a, b) =>
        compareStandingsTeams(
          { status: a.team.status, wins: a.team.wins, losses: a.team.losses, points: a.points },
          { status: b.team.status, wins: b.team.wins, losses: b.team.losses, points: b.points },
        ) || a.team.name.localeCompare(b.team.name),
    );

  return withStandingsRanks(
    visible.map(({ team }) => ({ ...toStandingTeam(team), status: team.status })),
    assignRanks,
  ).map((team) => ({ ...team, status: lower(team.status) }));
}

export async function listPublicSeasonStandings(seasonId: number, query: DivisionFilterQuery) {
  const season = await loadVisibleSeason(seasonId);
  const division =
    query.divisionId != null ? await loadSeasonDivision(season, query.divisionId) : null;

  const settings = await getGlobalSettings();
  const visibleStatuses = knownTeamStatuses(
    settings?.standingsVisibleStatuses?.length
      ? settings.standingsVisibleStatuses
      : [TeamStatus.READY, TeamStatus.PENDING],
  );
  const matchesStarted = await seasonHasPlayedMatches(season.id);
  const living = listsLivingSignups(season.signupsOpen, matchesStarted);
  const signupStatuses = knownTeamStatuses([
    ...new Set([...visibleStatuses, ...SIGNUP_LIST_STATUSES]),
  ]);
  const divisionStatuses = living ? signupStatuses : visibleStatuses;
  const unplacedStatuses = living
    ? signupStatuses
    : knownTeamStatuses([...new Set([...visibleStatuses, TeamStatus.UNREADY, TeamStatus.PENDING])]);

  if (division) {
    const teams = await standingsForDivision(
      season.id,
      season.regionId,
      division.id,
      divisionStatuses,
      living,
      true,
    );
    return full([{ division, teams }]);
  }

  const divisions = await prisma.division.findMany({
    where: { hidden: 0, regionId: season.regionId, formatId: season.formatId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  const groups = await Promise.all(
    divisions.map(async (item) => ({
      division: item,
      teams: await standingsForDivision(
        season.id,
        season.regionId,
        item.id,
        divisionStatuses,
        living,
        true,
      ),
    })),
  );

  const unplaced = await standingsForDivision(
    season.id,
    season.regionId,
    null,
    unplacedStatuses,
    living,
    false,
  );

  return full([...groups, { division: null, teams: unplaced }]);
}

export async function listPublicSeasonPlacements(seasonId: number, query: DivisionFilterQuery) {
  const season = await loadVisibleSeason(seasonId);
  if (query.divisionId != null) await loadSeasonDivision(season, query.divisionId);

  const rows = await prisma.playoffPlacement.findMany({
    where: {
      seasonId: season.id,
      ...(query.divisionId != null ? { divisionId: query.divisionId } : {}),
      division: { hidden: 0, regionId: season.regionId },
    },
    select: {
      place: true,
      division: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, players: rosterSelect } },
    },
    orderBy: [{ divisionId: 'asc' }, { place: 'asc' }],
  });

  return full(
    rows.map((row) => ({
      place: row.place,
      division: row.division,
      team: { id: row.team.id, name: row.team.name },
      players: toPlayers(row.team.players),
    })),
  );
}

function toTeamCard(team: {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  status: TeamStatus;
  wins: number;
  losses: number;
  format: { id: number; code: string; name: string };
  region: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
  season: { id: number; seasonNum: number } | null;
}) {
  return {
    id: team.id,
    name: team.name,
    acronym: team.acronym,
    avatar: team.avatar,
    status: lower(team.status),
    wins: team.wins,
    losses: team.losses,
    format: toFormat(team.format),
    region: team.region,
    division: team.division,
    season: team.season ? { id: team.season.id, number: team.season.seasonNum } : null,
  };
}

const teamCardSelect = {
  id: true,
  name: true,
  acronym: true,
  avatar: true,
  status: true,
  wins: true,
  losses: true,
  format: { select: { id: true, code: true, name: true } },
  region: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } },
  season: { select: { id: true, seasonNum: true } },
} satisfies Prisma.TeamSelect;

export async function listPublicTeams(query: TeamListQuery) {
  const where: Prisma.TeamWhereInput = {
    OR: [{ regionId: null }, { region: { hidden: 0 } }],
  };
  if (query.seasonId != null) where.seasonId = query.seasonId;
  if (query.divisionId != null) where.divisionId = query.divisionId;
  if (query.status != null) where.status = TEAM_STATUS_ENUM[query.status];

  const [total, rows] = await Promise.all([
    prisma.team.count({ where }),
    prisma.team.findMany({
      where,
      select: teamCardSelect,
      orderBy: { id: 'asc' },
      skip: (query.page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
    }),
  ]);

  return paged(rows.map(toTeamCard), query.page, total);
}

export async function getPublicTeam(id: number) {
  const team = await prisma.team.findFirst({
    where: { id, OR: [{ regionId: null }, { region: { hidden: 0 } }] },
    select: {
      ...teamCardSelect,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
      pointsScoredAgainst: true,
      players: rosterSelect,
    },
  });
  if (!team) throw new PublicNotFoundError('Team not found');

  return {
    ...toTeamCard(team),
    gamesWon: team.gamesWon,
    gamesLost: team.gamesLost,
    pointsScored: team.pointsScored,
    pointsScoredAgainst: team.pointsScoredAgainst,
    players: toPlayers(team.players),
  };
}

const matchSideSelect = {
  id: true,
  name: true,
  divisionId: true,
  division: { select: { id: true, name: true } },
  players: rosterSelect,
} satisfies Prisma.TeamSelect;

type MatchSideRow = Prisma.TeamGetPayload<{ select: typeof matchSideSelect }>;

function toMatchSide(team: MatchSideRow) {
  return {
    id: team.id,
    name: team.name,
    players: toPlayers(team.players),
  };
}

const matchSelect = {
  id: true,
  status: true,
  weekNo: true,
  playoffRound: true,
  playoffId: true,
  matchDateTime: true,
  matchTimezone: true,
  winnerId: true,
  winnerScore: true,
  loserScore: true,
  homeTeamId: true,
  boSeries: true,
  boGames: true,
  season: {
    select: {
      id: true,
      seasonNum: true,
      region: { select: { id: true, name: true } },
      format: { select: { id: true, code: true, name: true } },
    },
  },
  homeTeam: { select: matchSideSelect },
  awayTeam: { select: matchSideSelect },
} satisfies Prisma.MatchSelect;

type MatchRow = Prisma.MatchGetPayload<{ select: typeof matchSelect }>;

function toMatch(match: MatchRow, detailed: boolean) {
  const scores = scoresForLeagueMatch({
    winnerId: match.winnerId,
    homeTeamId: match.homeTeamId,
    winnerScore: match.winnerScore,
    loserScore: match.loserScore,
  });

  const body = {
    id: match.id,
    status: lower(match.status),
    week: match.weekNo,
    playoffRound: match.playoffId != null ? match.playoffRound : null,
    scheduledAt: match.matchDateTime?.toISOString() ?? null,
    timezone: match.matchTimezone,
    season: {
      id: match.season.id,
      number: match.season.seasonNum,
      region: match.season.region,
      format: toFormat(match.season.format),
    },
    division: match.homeTeam.division,
    home: toMatchSide(match.homeTeam),
    away: toMatchSide(match.awayTeam),
    score:
      scores.homeScore == null || scores.awayScore == null
        ? null
        : { home: scores.homeScore, away: scores.awayScore },
    winnerId: match.winnerId,
  };

  if (!detailed) return body;
  return { ...body, boSeries: match.boSeries, boGames: match.boGames };
}

function visibleMatchWhere(): Prisma.MatchWhereInput {
  return { season: { region: { hidden: 0 } } };
}

export async function listPublicMatches(query: MatchListQuery) {
  const where: Prisma.MatchWhereInput = visibleMatchWhere();
  if (query.seasonId != null) where.seasonId = query.seasonId;
  if (query.status != null) where.status = MATCH_STATUS_ENUM[query.status];
  if (query.week != null) where.weekNo = query.week;

  const and: Prisma.MatchWhereInput[] = [];
  if (query.teamId != null) {
    and.push({ OR: [{ homeTeamId: query.teamId }, { awayTeamId: query.teamId }] });
  }
  if (query.player != null) {
    const roster = { players: { some: { playerSteamId: query.player, active: 1 } } };
    and.push({ OR: [{ homeTeam: roster }, { awayTeam: roster }] });
  }
  if (query.divisionId != null) {
    and.push({
      OR: [
        { homeTeam: { divisionId: query.divisionId } },
        { awayTeam: { divisionId: query.divisionId } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  const [total, rows] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      select: matchSelect,
      orderBy: [{ weekNo: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
    }),
  ]);

  return paged(
    rows.map((row) => toMatch(row, false)),
    query.page,
    total,
  );
}

export async function getPublicMatch(id: number) {
  const match = await prisma.match.findFirst({
    where: { id, ...visibleMatchWhere() },
    select: {
      ...matchSelect,
      games: {
        select: {
          gameNum: true,
          homeTeamScore: true,
          awayTeamScore: true,
          arena: { select: { id: true, name: true } },
        },
        orderBy: { gameNum: 'asc' },
      },
    },
  });
  if (!match) throw new PublicNotFoundError('Match not found');

  const { games, ...row } = match;
  return {
    ...toMatch(row, true),
    games: games.map((game) => ({
      number: game.gameNum,
      homeScore: game.homeTeamScore,
      awayScore: game.awayTeamScore,
      arena: game.arena,
    })),
  };
}

export async function getPublicPlayer(steamId: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: {
      steamId: true,
      steamUsername: true,
      steamAvatar: true,
      banStatus: true,
      teamsPlayed: {
        where: {
          OR: [{ team: { regionId: null } }, { team: { region: { hidden: 0 } } }],
        },
        orderBy: { startedAt: 'desc' },
        select: {
          active: true,
          team: { select: teamCardSelect },
        },
      },
    },
  });
  if (!user) throw new PublicNotFoundError('Player not found');

  return {
    steamId: user.steamId,
    name: user.steamUsername,
    avatar: user.steamAvatar,
    banStatus: lower(user.banStatus ?? BanStatus.NONE),
    teams: user.teamsPlayed.map((membership) => ({
      ...toTeamCard(membership.team),
      active: membership.active === 1,
    })),
  };
}
