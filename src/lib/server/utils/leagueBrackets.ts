import type { BracketData, BracketStatus } from '#lib/types/bracket.js';
import type { LeaguePlayoffDivision } from '#lib/types/league.js';
import { scoresForLeagueMatch } from '#lib/utils/leagueMatches.js';
import { formatPlayoffRound, playoffRoundSortKey } from '#lib/utils/playoffs.js';
import {
  buildCardBracket,
  buildDoubleElimBracket,
  buildSingleElimBracket,
  type BracketMatchInput,
  type BracketPlayerInput,
} from '#lib/server/utils/bracketBuilders.js';

export type LeaguePlayoffSideInput = {
  id: number;
  name: string;
  avatar: string | null;
  divisionId: number | null;
  divisionName: string | null;
  isIndividual: boolean;
  player?: { steamId: string; name: string; avatar: string | null } | null;
};

export type LeaguePlayoffSlotSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

export type LeaguePlayoffSlotMatchInput = {
  id: number;
  status: string;
  boSeries: number | null;
  winnerId: number | null;
  winnerScore: number | null;
  loserScore: number | null;
  homeTeamId: number;
};

export type LeaguePlayoffSlotInput = {
  id: number;
  divisionId: number;
  divisionName: string;
  format: 'SINGLE_ELIM' | 'DOUBLE_ELIM';
  section: LeaguePlayoffSlotSection;
  round: number;
  position: number;
  isBye: boolean;
  winnerNextSlotId: number | null;
  winnerNextSide: number | null;
  loserNextSlotId: number | null;
  team1: LeaguePlayoffSideInput | null;
  team2: LeaguePlayoffSideInput | null;
  match: LeaguePlayoffSlotMatchInput | null;
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

function placeholderSide(name: 'BYE' | 'TBD', side: 1 | 2): BracketPlayerInput {
  return { displayName: name, side };
}

function slotPlayers(
  team: LeaguePlayoffSideInput | null,
  side: 1 | 2,
  emptyName: 'BYE' | 'TBD',
): BracketPlayerInput[] {
  if (team) return sidePlayers(team, side);
  return [placeholderSide(emptyName, side)];
}

/** One division tree from stored slots. Edges point at slot ids, including slots that have no match yet. */
export function buildLeagueSlotBracket(
  slots: LeaguePlayoffSlotInput[],
): LeaguePlayoffDivision | null {
  const first = slots[0];
  if (!first) return null;

  const inputs: BracketMatchInput[] = slots.map((slot) => {
    const emptyName = slot.isBye ? 'BYE' : 'TBD';
    const scores = slot.match
      ? scoresForLeagueMatch({
          winnerId: slot.match.winnerId,
          homeTeamId: slot.match.homeTeamId,
          winnerScore: slot.match.winnerScore,
          loserScore: slot.match.loserScore,
        })
      : { homeScore: null, awayScore: null };
    const homeIsTeam1 = slot.team1 != null && slot.match?.homeTeamId === slot.team1.id;
    let winnerSide: number | null = null;
    if (slot.match?.winnerId != null) {
      if (slot.match.winnerId === slot.team1?.id) winnerSide = 1;
      else if (slot.match.winnerId === slot.team2?.id) winnerSide = 2;
    } else if (slot.isBye && slot.team1 && !slot.team2) {
      winnerSide = 1;
    } else if (slot.isBye && slot.team2 && !slot.team1) {
      winnerSide = 2;
    }

    return {
      id: slot.id,
      round: slot.round,
      orderNum: slot.round * 100 + slot.position,
      label: null,
      section: slot.section,
      winnerSide,
      side1Score: homeIsTeam1 ? scores.homeScore : scores.awayScore,
      side2Score: homeIsTeam1 ? scores.awayScore : scores.homeScore,
      boSeries: slot.match?.boSeries ?? 0,
      status: slot.isBye ? 'PLAYED' : (slot.match?.status ?? 'UNPLAYED'),
      href: slot.match ? `/matches/${slot.match.id}` : null,
      winnerNextMatchId: slot.winnerNextSlotId,
      winnerNextSide: slot.winnerNextSide,
      loserNextMatchId: slot.loserNextSlotId,
      players: [...slotPlayers(slot.team1, 1, emptyName), ...slotPlayers(slot.team2, 2, emptyName)],
    };
  });

  const played = slots.filter((slot) => slot.isBye || slot.match?.status === 'PLAYED').length;
  const status: BracketStatus =
    played === 0 ? 'upcoming' : played === slots.length ? 'completed' : 'in_progress';
  const stage = { name: first.divisionName, matches: inputs };
  const bracket: BracketData =
    first.format === 'DOUBLE_ELIM'
      ? buildDoubleElimBracket(stage, status, { padByes: false })
      : buildSingleElimBracket(stage, status, { padByes: false });

  return {
    divisionId: first.divisionId,
    divisionName: first.divisionName,
    bracket,
    placements: [],
  };
}

function roundRank(round: number): number {
  if (round === 0) return Number.POSITIVE_INFINITY;
  return playoffRoundSortKey(round);
}

/**
 * Group old playoff matches by the home team's division.
 * Each division is a round list. Seasons without slots have no stored edges,
 * so this does not invent bracket lines.
 */
export function buildLeaguePlayoffDivisions(
  matches: LeaguePlayoffMatchInput[],
): LeaguePlayoffDivision[] {
  const byDivision = new Map<
    number,
    { name: string; matches: LeaguePlayoffMatchInput[]; inputs: BracketMatchInput[] }
  >();

  for (const match of matches) {
    const divisionId = match.home.divisionId;
    const mapped = mapLeaguePlayoffMatch(match);
    if (divisionId == null || mapped == null) continue;
    const listed = { ...mapped, label: null, winnerNextMatchId: null, loserNextMatchId: null };

    const existing = byDivision.get(divisionId);
    if (existing) {
      existing.matches.push(match);
      existing.inputs.push(listed);
      continue;
    }

    byDivision.set(divisionId, {
      name: match.home.divisionName ?? `Division ${divisionId}`,
      matches: [match],
      inputs: [listed],
    });
  }

  return [...byDivision.entries()]
    .sort(([a], [b]) => b - a)
    .map(([divisionId, group]) => {
      const status = bracketStatusFor(group.matches);
      const byRound = new Map<number, BracketMatchInput[]>();
      for (const input of group.inputs) {
        const round = input.round ?? 0;
        const rows = byRound.get(round) ?? [];
        rows.push(input);
        byRound.set(round, rows);
      }

      const rounds = [...byRound.entries()]
        .sort(([a], [b]) => roundRank(a) - roundRank(b))
        .map(([roundNum, roundMatches]) => {
          const card = buildCardBracket({ name: group.name, matches: roundMatches }, status);
          return {
            number: roundNum,
            label: roundNum === 0 ? 'Grand Final' : formatPlayoffRound(roundNum),
            matches: card.rounds[0]?.matches ?? [],
          };
        });

      const bracket: BracketData = {
        format: 'card',
        status,
        rounds,
        title: group.name,
      };
      return { divisionId, divisionName: group.name, bracket, placements: [] };
    });
}
