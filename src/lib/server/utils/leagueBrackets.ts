import type { BracketData, BracketStatus } from '$lib/types/bracket';
import type { LeaguePlayoffDivision } from '$lib/types/league';
import { scoresForLeagueMatch } from '$lib/utils/leagueMatches';
import { formatPlayoffRound } from '$lib/utils/playoffs';
import {
  buildDoubleElimBracket,
  buildSingleElimBracket,
  type BracketMatchInput,
  type BracketPlayerInput,
} from '$lib/server/utils/bracketBuilders';

export type LeaguePlayoffSideInput = {
  id: number;
  name: string;
  avatar: string | null;
  divisionId: number | null;
  divisionName: string | null;
  isIndividual: boolean;
  player?: { steamId: string; name: string; avatar: string | null } | null;
};

export type LeaguePlayoffMatchInput = {
  id: number;
  playoffRound: number | null;
  status: string;
  boSeries: number | null;
  winnerId: number | null;
  winnerScore: number | null;
  loserScore: number | null;
  homeTeamId: number;
  home: LeaguePlayoffSideInput;
  away: LeaguePlayoffSideInput;
};

function sidePlayers(side: LeaguePlayoffSideInput, sideNum: 1 | 2): BracketPlayerInput[] {
  if (side.isIndividual && side.player) {
    return [
      {
        displayName: side.player.name,
        steamId: side.player.steamId,
        avatarUrl: side.player.avatar,
        href: `/users/${side.player.steamId}`,
        side: sideNum,
      },
    ];
  }

  return [
    {
      displayName: side.name,
      avatarUrl: side.avatar,
      href: `/teams/${side.id}`,
      side: sideNum,
    },
  ];
}

function winnerSideOf(match: LeaguePlayoffMatchInput): number | null {
  if (match.winnerId == null) return null;
  if (match.winnerId === match.homeTeamId) return 1;
  if (match.winnerId === match.away.id) return 2;
  return null;
}

function matchLabel(playoffRound: number): string {
  if (playoffRound === 0) return 'Grand Final';
  return formatPlayoffRound(playoffRound);
}

export function mapLeaguePlayoffMatch(match: LeaguePlayoffMatchInput): BracketMatchInput | null {
  if (match.playoffRound == null) return null;

  const scores = scoresForLeagueMatch(match);
  const winnerSide = winnerSideOf(match);

  return {
    id: match.id,
    round: match.playoffRound,
    orderNum: match.id,
    label: matchLabel(match.playoffRound),
    winnerSide,
    side1Score: scores.homeScore,
    side2Score: scores.awayScore,
    boSeries: match.boSeries ?? 0,
    status: match.status,
    href: `/matches/${match.id}`,
    players: [...sidePlayers(match.home, 1), ...sidePlayers(match.away, 2)],
  };
}

function bracketStatusFor(matches: LeaguePlayoffMatchInput[]): BracketStatus {
  if (matches.length === 0) return 'upcoming';
  const played = matches.filter((match) => match.status === 'PLAYED').length;
  if (played === matches.length) return 'completed';
  if (played > 0) return 'in_progress';
  return 'upcoming';
}

/**
 * Group playoff matches by the home team's division and build one tree each.
 * Divisions with no playoff matches are omitted.
 */
export function buildLeaguePlayoffDivisions(
  matches: LeaguePlayoffMatchInput[],
  doubleElim: boolean,
): LeaguePlayoffDivision[] {
  const byDivision = new Map<
    number,
    { name: string; matches: LeaguePlayoffMatchInput[]; inputs: BracketMatchInput[] }
  >();

  for (const match of matches) {
    const divisionId = match.home.divisionId;
    const mapped = mapLeaguePlayoffMatch(match);
    if (divisionId == null || mapped == null) continue;

    const existing = byDivision.get(divisionId);
    if (existing) {
      existing.matches.push(match);
      existing.inputs.push(mapped);
      continue;
    }

    byDivision.set(divisionId, {
      name: match.home.divisionName ?? `Division ${divisionId}`,
      matches: [match],
      inputs: [mapped],
    });
  }

  return [...byDivision.entries()]
    .sort(([a], [b]) => b - a)
    .map(([divisionId, group]) => {
      const status = bracketStatusFor(group.matches);
      const stage = { name: group.name, matches: group.inputs };
      const bracket: BracketData = doubleElim
        ? buildDoubleElimBracket(stage, status, { padByes: false })
        : buildSingleElimBracket(stage, status, { padByes: false });
      return { divisionId, divisionName: group.name, bracket };
    });
}
