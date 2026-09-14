import { describe, expect, it } from 'vitest';
import {
  buildLeaguePlayoffDivisions,
  mapLeaguePlayoffMatch,
  type LeaguePlayoffMatchInput,
  type LeaguePlayoffSideInput,
} from './leagueBrackets';

const froyo: LeaguePlayoffSideInput = {
  id: 10,
  name: 'Froyotech',
  avatar: 'https://example.com/froyo.png',
  divisionId: 8,
  divisionName: 'Premier',
  isIndividual: false,
};

const knd: LeaguePlayoffSideInput = {
  id: 11,
  name: 'KND',
  avatar: 'https://example.com/knd.png',
  divisionId: 8,
  divisionName: 'Premier',
  isIndividual: false,
};

const stabby: LeaguePlayoffSideInput = {
  id: 20,
  name: 'stabby',
  avatar: null,
  divisionId: 9,
  divisionName: 'Invite',
  isIndividual: true,
  player: {
    steamId: '76561198000000001',
    name: 'stabby',
    avatar: 'https://example.com/stabby.jpg',
  },
};

const banny: LeaguePlayoffSideInput = {
  id: 21,
  name: 'b4nny',
  avatar: null,
  divisionId: 9,
  divisionName: 'Invite',
  isIndividual: true,
  player: {
    steamId: '76561198000000002',
    name: 'b4nny',
    avatar: 'https://example.com/banny.jpg',
  },
};

function match(
  overrides: Partial<LeaguePlayoffMatchInput> &
    Pick<LeaguePlayoffMatchInput, 'id' | 'playoffRound' | 'home' | 'away'>,
): LeaguePlayoffMatchInput {
  return {
    status: 'UNPLAYED',
    boSeries: 3,
    winnerId: null,
    winnerScore: null,
    loserScore: null,
    homeTeamId: overrides.home.id,
    ...overrides,
  };
}

describe('mapLeaguePlayoffMatch', () => {
  it('maps 2v2 as a single team identity with team avatar and href', () => {
    const input = mapLeaguePlayoffMatch(
      match({
        id: 101,
        playoffRound: 1,
        status: 'PLAYED',
        winnerId: 10,
        winnerScore: 2,
        loserScore: 0,
        home: froyo,
        away: knd,
      }),
    );

    expect(input).toMatchObject({
      id: 101,
      round: 1,
      href: '/matches/101',
      winnerSide: 1,
      side1Score: 2,
      side2Score: 0,
    });
    expect(input?.players).toEqual([
      {
        displayName: 'Froyotech',
        avatarUrl: 'https://example.com/froyo.png',
        href: '/teams/10',
        side: 1,
      },
      {
        displayName: 'KND',
        avatarUrl: 'https://example.com/knd.png',
        href: '/teams/11',
        side: 2,
      },
    ]);
  });

  it('maps 1v1 as a single player with steam avatar and user href', () => {
    const input = mapLeaguePlayoffMatch(
      match({
        id: 202,
        playoffRound: -1,
        home: stabby,
        away: banny,
      }),
    );

    expect(input?.round).toBe(-1);
    expect(input?.label).toBe('Lower Round 1');
    expect(input?.players).toEqual([
      {
        displayName: 'stabby',
        steamId: '76561198000000001',
        avatarUrl: 'https://example.com/stabby.jpg',
        href: '/users/76561198000000001',
        side: 1,
      },
      {
        displayName: 'b4nny',
        steamId: '76561198000000002',
        avatarUrl: 'https://example.com/banny.jpg',
        href: '/users/76561198000000002',
        side: 2,
      },
    ]);
  });

  it('skips rows without a playoff round', () => {
    expect(
      mapLeaguePlayoffMatch(
        match({
          id: 1,
          playoffRound: null,
          home: froyo,
          away: knd,
        }),
      ),
    ).toBeNull();
  });
});

describe('buildLeaguePlayoffDivisions', () => {
  const premierMatches = [
    match({
      id: 1,
      playoffRound: 1,
      status: 'PLAYED',
      winnerId: 10,
      winnerScore: 2,
      loserScore: 1,
      home: froyo,
      away: knd,
    }),
    match({
      id: 2,
      playoffRound: -1,
      home: knd,
      away: { ...knd, id: 12, name: 'SVIFT', avatar: null },
    }),
    match({
      id: 3,
      playoffRound: 2,
      home: froyo,
      away: { ...knd, id: 13, name: 'Witness', avatar: null },
    }),
    match({
      id: 4,
      playoffRound: 0,
      home: froyo,
      away: knd,
    }),
  ];

  it('groups by home division and omits divisions with no playoff matches', () => {
    const unplaced = match({
      id: 99,
      playoffRound: 1,
      home: { ...froyo, divisionId: null, divisionName: null },
      away: knd,
    });
    const invite = match({
      id: 50,
      playoffRound: 1,
      home: stabby,
      away: banny,
    });

    const divisions = buildLeaguePlayoffDivisions([...premierMatches, unplaced, invite], false);
    expect(divisions.map((division) => division.divisionId)).toEqual([9, 8]);
    expect(divisions[0]?.divisionName).toBe('Invite');
    expect(divisions[1]?.divisionName).toBe('Premier');
  });

  it('uses the double-elim builder when doubleElim is true', () => {
    const [premier] = buildLeaguePlayoffDivisions(premierMatches, true);
    expect(premier?.bracket.format).toBe('double_elim');
    if (premier?.bracket.format !== 'double_elim') return;
    expect(premier.bracket.rounds.length).toBeGreaterThan(0);
    expect(premier.bracket.loserRounds?.length).toBeGreaterThan(0);
    expect(premier.bracket.grandFinal?.matches[0]?.href).toBe('/matches/4');
    expect(premier.bracket.grandFinal?.matches[0]?.label).toBe('Grand Final');
  });

  it('uses the single-elim builder when doubleElim is false', () => {
    const upperOnly = premierMatches.filter(
      (row) => row.playoffRound != null && row.playoffRound > 0,
    );
    const [premier] = buildLeaguePlayoffDivisions(upperOnly, false);
    expect(premier?.bracket.format).toBe('single_elim');
    if (premier?.bracket.format !== 'single_elim') return;
    expect(premier.bracket.loserRounds).toBeUndefined();
    const hrefs = premier.bracket.rounds.flatMap((round) =>
      round.matches.map((bracketMatch) => bracketMatch.href),
    );
    expect(hrefs).toContain('/matches/1');
    expect(hrefs).toContain('/matches/3');
  });

  it('marks a mixed played/unplayed tree as in progress', () => {
    const [premier] = buildLeaguePlayoffDivisions(premierMatches, true);
    expect(premier?.bracket.status).toBe('in_progress');
  });

  it('does not duplicate match ids across an irregular double-elim tree', () => {
    const extraUpper = match({
      id: 3562,
      playoffRound: 1,
      home: froyo,
      away: { ...knd, id: 14, name: 'froyotech', avatar: null },
    });
    const extraUpperB = match({
      id: 5,
      playoffRound: 1,
      home: { ...froyo, id: 15, name: 'Gamer', avatar: null },
      away: { ...knd, id: 16, name: 'Crew', avatar: null },
    });
    const extraSemis = [
      match({
        id: 6,
        playoffRound: 2,
        home: froyo,
        away: { ...knd, id: 17, name: 'TBD A', avatar: null },
      }),
      match({
        id: 7,
        playoffRound: 2,
        home: knd,
        away: { ...knd, id: 18, name: 'TBD B', avatar: null },
      }),
      match({
        id: 8,
        playoffRound: 2,
        home: { ...froyo, id: 15, name: 'Gamer', avatar: null },
        away: { ...knd, id: 16, name: 'Crew', avatar: null },
      }),
    ];

    const [premier] = buildLeaguePlayoffDivisions(
      [...premierMatches, extraUpper, extraUpperB, ...extraSemis],
      true,
    );
    expect(premier?.bracket.format).toBe('double_elim');
    if (premier?.bracket.format !== 'double_elim') return;

    for (const round of [...premier.bracket.rounds, ...(premier.bracket.loserRounds ?? [])]) {
      const ids = round.matches.map((bracketMatch) => String(bracketMatch.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
