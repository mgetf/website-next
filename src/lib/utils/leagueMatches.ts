import type {
  LeagueDivisionMatch,
  LeagueMatchSide,
  LeagueMatchStatus,
  LeagueMatchWeekGroup,
} from '$lib/types/league';

export function groupLeagueMatchesByWeek(matches: LeagueDivisionMatch[]): LeagueMatchWeekGroup[] {
  const groups = new Map<number, LeagueMatchWeekGroup>();

  for (const match of matches) {
    const existing = groups.get(match.weekNo);
    if (existing) {
      existing.matches.push(match);
      continue;
    }
    groups.set(match.weekNo, {
      weekNo: match.weekNo,
      weekLabel: match.weekLabel,
      matches: [match],
    });
  }

  return [...groups.values()]
    .sort((a, b) => a.weekNo - b.weekNo)
    .map((group) => ({
      ...group,
      matches: [...group.matches].sort((a, b) => a.id - b.id),
    }));
}

export function formatLeagueMatchScore(match: LeagueDivisionMatch): string | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  return `${match.homeScore}–${match.awayScore}`;
}

export function isLeagueMatchSideWinner(
  match: LeagueDivisionMatch,
  side: 'home' | 'away',
): boolean {
  if (match.homeScore == null || match.awayScore == null) return false;
  if (match.homeScore === match.awayScore) return false;
  const homeWon = match.homeScore > match.awayScore;
  return side === 'home' ? homeWon : !homeWon;
}

/** Regular-season rows only. Playoffs belong on the bracket, not this list. */
export function isRegularSeasonLeagueMatch(match: {
  playoffId: number | null;
  weekNo: number | null;
}): boolean {
  return match.playoffId == null && match.weekNo != null;
}

/** Attach to home's division; skip unassigned home. Never duplicate. */
export function divisionIdForLeagueMatch(
  homeDivisionId: number | null,
  _awayDivisionId: number | null,
): number | null {
  return homeDivisionId;
}

export function scoresForLeagueMatch(input: {
  winnerId: number | null;
  homeTeamId: number;
  winnerScore: number | null;
  loserScore: number | null;
}): { homeScore: number | null; awayScore: number | null } {
  if (input.winnerScore == null || input.loserScore == null) {
    return { homeScore: null, awayScore: null };
  }

  if (input.winnerId == null) {
    if (input.winnerScore === input.loserScore) {
      return { homeScore: input.winnerScore, awayScore: input.loserScore };
    }
    return { homeScore: null, awayScore: null };
  }

  const homeWon = input.winnerId === input.homeTeamId;
  return {
    homeScore: homeWon ? input.winnerScore : input.loserScore,
    awayScore: homeWon ? input.loserScore : input.winnerScore,
  };
}

export type LeagueTeamSideInput = {
  id: number;
  name: string;
  avatar: string | null;
  isIndividual: boolean;
  player?: { steamId: string; name: string; avatar: string | null } | null;
};

export function leagueMatchSideFromTeam(team: LeagueTeamSideInput): LeagueMatchSide {
  if (team.isIndividual && team.player) {
    return {
      id: team.id,
      name: team.player.name,
      avatar: team.player.avatar,
      href: `/users/${team.player.steamId}`,
    };
  }

  return {
    id: team.id,
    name: team.name,
    avatar: team.avatar,
    href: `/teams/${team.id}`,
  };
}

export function toLeagueDivisionMatch(input: {
  id: number;
  weekNo: number;
  status: LeagueMatchStatus;
  home: LeagueMatchSide;
  away: LeagueMatchSide;
  winnerId: number | null;
  homeTeamId: number;
  winnerScore: number | null;
  loserScore: number | null;
}): LeagueDivisionMatch {
  const scores = scoresForLeagueMatch(input);
  return {
    id: input.id,
    weekNo: input.weekNo,
    weekLabel: `Week ${input.weekNo}`,
    status: input.status,
    href: `/matches/${input.id}`,
    home: input.home,
    away: input.away,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
  };
}

export function leagueWeekNumbers(matches: LeagueDivisionMatch[]): number[] {
  return [...new Set(matches.map((match) => match.weekNo))].sort((a, b) => a - b);
}

export function latestLeagueWeek(matches: LeagueDivisionMatch[]): number | null {
  const weeks = leagueWeekNumbers(matches);
  return weeks.length > 0 ? weeks[weeks.length - 1] : null;
}

export function filterLeagueMatchesByWeek(
  matches: LeagueDivisionMatch[],
  week: number | 'all',
): LeagueDivisionMatch[] {
  if (week === 'all') return matches;
  return matches.filter((match) => match.weekNo === week);
}
