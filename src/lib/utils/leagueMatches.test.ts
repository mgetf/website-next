import { describe, expect, it } from 'vitest';
import type { LeagueDivisionMatch } from '$lib/types/league';
import {
  divisionIdForLeagueMatch,
  formatLeagueMatchScore,
  groupLeagueMatchesByWeek,
  isLeagueMatchSideWinner,
  isRegularSeasonLeagueMatch,
  leagueMatchSideFromTeam,
  scoresForLeagueMatch,
  toLeagueDivisionMatch,
  filterLeagueMatchesByWeek,
  latestLeagueWeek,
  leagueWeekNumbers,
} from './leagueMatches';

function match(
  partial: Partial<LeagueDivisionMatch> & Pick<LeagueDivisionMatch, 'id' | 'weekNo'>,
): LeagueDivisionMatch {
  const weekLabel = partial.weekLabel ?? `Week ${partial.weekNo}`;
  return {
    weekLabel,
    status: 'UNPLAYED',
    href: '#',
    home: { id: 1, name: 'Home', avatar: null, href: '/teams/1' },
    away: { id: 2, name: 'Away', avatar: null, href: '/teams/2' },
    homeScore: null,
    awayScore: null,
    ...partial,
  };
}

describe('groupLeagueMatchesByWeek', () => {
  it('groups by weekNo, sorts weeks ascending, and sorts matches by id', () => {
    const grouped = groupLeagueMatchesByWeek([
      match({ id: 4, weekNo: 2, weekLabel: 'Week 2' }),
      match({ id: 2, weekNo: 1, weekLabel: 'Week 1' }),
      match({ id: 1, weekNo: 1, weekLabel: 'Week 1' }),
      match({ id: 3, weekNo: 2, weekLabel: 'Week 2' }),
    ]);

    expect(grouped.map((g) => g.weekNo)).toEqual([1, 2]);
    expect(grouped[0].matches.map((m) => m.id)).toEqual([1, 2]);
    expect(grouped[1].matches.map((m) => m.id)).toEqual([3, 4]);
  });
});

describe('formatLeagueMatchScore', () => {
  it('returns an en-dash score when both sides have points', () => {
    expect(formatLeagueMatchScore(match({ id: 1, weekNo: 1, homeScore: 2, awayScore: 1 }))).toBe(
      '2–1',
    );
  });

  it('returns null when the match has no score yet', () => {
    expect(formatLeagueMatchScore(match({ id: 1, weekNo: 1 }))).toBeNull();
  });
});

describe('isLeagueMatchSideWinner', () => {
  it('marks the higher score as the winner', () => {
    const played = match({ id: 1, weekNo: 1, homeScore: 2, awayScore: 0 });
    expect(isLeagueMatchSideWinner(played, 'home')).toBe(true);
    expect(isLeagueMatchSideWinner(played, 'away')).toBe(false);
  });

  it('returns false for draws and unplayed matches', () => {
    expect(
      isLeagueMatchSideWinner(match({ id: 1, weekNo: 1, homeScore: 1, awayScore: 1 }), 'home'),
    ).toBe(false);
    expect(isLeagueMatchSideWinner(match({ id: 1, weekNo: 1 }), 'away')).toBe(false);
  });
});

describe('isRegularSeasonLeagueMatch', () => {
  it('keeps week matches and drops playoffs', () => {
    expect(isRegularSeasonLeagueMatch({ playoffId: null, weekNo: 1 })).toBe(true);
    expect(isRegularSeasonLeagueMatch({ playoffId: 3, weekNo: null })).toBe(false);
    expect(isRegularSeasonLeagueMatch({ playoffId: null, weekNo: null })).toBe(false);
  });
});

describe('divisionIdForLeagueMatch', () => {
  it('attaches to the home division and skips unassigned home', () => {
    expect(divisionIdForLeagueMatch(12, 12)).toBe(12);
    expect(divisionIdForLeagueMatch(12, 8)).toBe(12);
    expect(divisionIdForLeagueMatch(null, 8)).toBeNull();
  });
});

describe('scoresForLeagueMatch', () => {
  it('maps winner/loser scores onto home and away', () => {
    expect(
      scoresForLeagueMatch({
        winnerId: 1,
        homeTeamId: 1,
        winnerScore: 2,
        loserScore: 0,
      }),
    ).toEqual({ homeScore: 2, awayScore: 0 });
    expect(
      scoresForLeagueMatch({
        winnerId: 9,
        homeTeamId: 1,
        winnerScore: 2,
        loserScore: 1,
      }),
    ).toEqual({ homeScore: 1, awayScore: 2 });
  });

  it('returns a draw when there is no winner and the scores are equal', () => {
    expect(
      scoresForLeagueMatch({
        winnerId: null,
        homeTeamId: 1,
        winnerScore: 1,
        loserScore: 1,
      }),
    ).toEqual({ homeScore: 1, awayScore: 1 });
  });

  it('returns null scores when the match has not been reported', () => {
    expect(
      scoresForLeagueMatch({
        winnerId: null,
        homeTeamId: 1,
        winnerScore: null,
        loserScore: null,
      }),
    ).toEqual({ homeScore: null, awayScore: null });
  });
});

describe('toLeagueDivisionMatch', () => {
  it('returns a plain serializable row with a match href', () => {
    const row = toLeagueDivisionMatch({
      id: 44,
      weekNo: 2,
      status: 'PLAYED',
      home: { id: 1, name: 'Home', avatar: null, href: '/teams/1' },
      away: { id: 2, name: 'Away', avatar: null, href: '/teams/2' },
      winnerId: 1,
      homeTeamId: 1,
      winnerScore: 2,
      loserScore: 1,
    });

    expect(row).toEqual({
      id: 44,
      weekNo: 2,
      weekLabel: 'Week 2',
      status: 'PLAYED',
      href: '/matches/44',
      home: { id: 1, name: 'Home', avatar: null, href: '/teams/1' },
      away: { id: 2, name: 'Away', avatar: null, href: '/teams/2' },
      homeScore: 2,
      awayScore: 1,
    });
  });
});

describe('leagueMatchSideFromTeam', () => {
  it('uses the player profile for 1v1 and the team profile for 2v2', () => {
    expect(
      leagueMatchSideFromTeam({
        id: 10,
        name: 'Solo Entry',
        avatar: 'team.png',
        isIndividual: true,
        player: { steamId: '765', name: 'stabby', avatar: 'player.png' },
      }),
    ).toEqual({
      id: 10,
      name: 'stabby',
      avatar: 'player.png',
      href: '/users/765',
    });

    expect(
      leagueMatchSideFromTeam({
        id: 10,
        name: 'Froyotech',
        avatar: 'team.png',
        isIndividual: false,
      }),
    ).toEqual({
      id: 10,
      name: 'Froyotech',
      avatar: 'team.png',
      href: '/teams/10',
    });
  });
});

describe('league week filter', () => {
  const rows = [
    match({ id: 1, weekNo: 1 }),
    match({ id: 2, weekNo: 3 }),
    match({ id: 3, weekNo: 2 }),
    match({ id: 4, weekNo: 3 }),
  ];

  it('lists unique weeks ascending and picks the latest', () => {
    expect(leagueWeekNumbers(rows)).toEqual([1, 2, 3]);
    expect(latestLeagueWeek(rows)).toBe(3);
    expect(latestLeagueWeek([])).toBeNull();
  });

  it('filters to one week or returns all', () => {
    expect(filterLeagueMatchesByWeek(rows, 3).map((m) => m.id)).toEqual([2, 4]);
    expect(filterLeagueMatchesByWeek(rows, 'all')).toEqual(rows);
  });
});
