import { describe, expect, it } from 'vitest';
import { buildPlayoffBracket } from './playoffBracket';
import {
  buildLeaguePlayoffDivisions,
  buildLeagueSlotBracket,
  mapLeaguePlayoffMatch,
  type LeaguePlayoffMatchInput,
  type LeaguePlayoffSideInput,
  type LeaguePlayoffSlotInput,
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

    const divisions = buildLeaguePlayoffDivisions([...premierMatches, unplaced, invite]);
    expect(divisions.map((division) => division.divisionId)).toEqual([9, 8]);
    expect(divisions[0]?.divisionName).toBe('Invite');
    expect(divisions[1]?.divisionName).toBe('Premier');
  });

  it('lists old rounds without advancement edges', () => {
    const [premier] = buildLeaguePlayoffDivisions(premierMatches);
    expect(premier?.bracket.format).toBe('card');
    if (premier?.bracket.format !== 'card') return;
    expect(premier.bracket.rounds.map((round) => round.label)).toEqual([
      'Upper Round 1',
      'Lower Round 1',
      'Upper Round 2',
      'Grand Final',
    ]);
    expect(premier.bracket.rounds[3]?.matches[0]?.href).toBe('/matches/4');
    for (const round of premier.bracket.rounds) {
      for (const bracketMatch of round.matches) {
        expect(bracketMatch.winnerNextMatchId).toBeUndefined();
        expect(bracketMatch.loserNextMatchId).toBeUndefined();
      }
    }
  });

  it('keeps upper-round matches in the round list', () => {
    const upperOnly = premierMatches.filter(
      (row) => row.playoffRound != null && row.playoffRound > 0,
    );
    const [premier] = buildLeaguePlayoffDivisions(upperOnly);
    expect(premier?.bracket.format).toBe('card');
    if (premier?.bracket.format !== 'card') return;
    const hrefs = premier.bracket.rounds.flatMap((round) =>
      round.matches.map((bracketMatch) => bracketMatch.href),
    );
    expect(hrefs).toContain('/matches/1');
    expect(hrefs).toContain('/matches/3');
  });

  it('marks a mixed played/unplayed list as in progress', () => {
    const [premier] = buildLeaguePlayoffDivisions(premierMatches);
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

    const [premier] = buildLeaguePlayoffDivisions([
      ...premierMatches,
      extraUpper,
      extraUpperB,
      ...extraSemis,
    ]);
    expect(premier?.bracket.format).toBe('card');
    if (premier?.bracket.format !== 'card') return;

    for (const round of premier.bracket.rounds) {
      const ids = round.matches.map((bracketMatch) => String(bracketMatch.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

function teamSide(id: number): LeaguePlayoffSideInput {
  return {
    id,
    name: `Seed ${id}`,
    avatar: null,
    divisionId: 1,
    divisionName: 'Lab',
    isIndividual: true,
  };
}

describe('buildLeagueSlotBracket', () => {
  function slotsFromDrafts(format: 'SINGLE_ELIM' | 'DOUBLE_ELIM', teamIds: number[]) {
    const drafts = buildPlayoffBracket(
      format,
      teamIds.map((id) => ({ id })),
    );
    const idByKey = new Map(drafts.map((draft, index) => [draft.key, index + 1]));
    return drafts.map((draft): LeaguePlayoffSlotInput => {
      return {
        id: idByKey.get(draft.key) ?? 0,
        divisionId: 1,
        divisionName: 'Lab',
        format,
        section: draft.section,
        round: draft.round,
        position: draft.position,
        isBye: draft.isBye,
        winnerNextSlotId: draft.winnerNextKey ? (idByKey.get(draft.winnerNextKey) ?? null) : null,
        winnerNextSide: draft.winnerNextSide,
        loserNextSlotId: draft.loserNextKey ? (idByKey.get(draft.loserNextKey) ?? null) : null,
        team1: draft.team1Id ? teamSide(draft.team1Id) : null,
        team2: draft.team2Id ? teamSide(draft.team2Id) : null,
        match:
          !draft.isBye && draft.team1Id != null && draft.team2Id != null
            ? {
                id: 500 + (idByKey.get(draft.key) ?? 0),
                status: 'UNPLAYED',
                boSeries: 3,
                winnerId: null,
                winnerScore: null,
                loserScore: null,
                homeTeamId: draft.team1Id,
              }
            : null,
      };
    });
  }

  it('draws a single-elim tree from slot edges, including byes and empty later slots', () => {
    const division = buildLeagueSlotBracket(slotsFromDrafts('SINGLE_ELIM', [1, 2, 3, 4, 5, 6]));
    expect(division?.bracket.format).toBe('single_elim');
    if (division?.bracket.format !== 'single_elim') return;

    const matches = division.bracket.rounds.flatMap((round) => round.matches);
    expect(matches.some((bracketMatch) => bracketMatch.isBye)).toBe(true);
    expect(matches.some((bracketMatch) => bracketMatch.side1.label === 'TBD')).toBe(true);
    expect(matches.some((bracketMatch) => bracketMatch.winnerNextMatchId != null)).toBe(true);
    const linked = matches.find((bracketMatch) => bracketMatch.href);
    expect(linked?.href).toMatch(/^\/matches\//);
  });

  it('points the winners and losers finals at the grand final slot', () => {
    const division = buildLeagueSlotBracket(slotsFromDrafts('DOUBLE_ELIM', [1, 2, 3, 4]));
    expect(division?.bracket.format).toBe('double_elim');
    if (division?.bracket.format !== 'double_elim') return;

    const grandFinalId = division.bracket.grandFinal?.matches[0]?.id;
    expect(grandFinalId).toBeDefined();
    const winnersFinal = division.bracket.rounds.at(-1)?.matches[0];
    const losersFinal = division.bracket.loserRounds?.at(-1)?.matches[0];
    expect(winnersFinal?.winnerNextMatchId).toBe(grandFinalId);
    expect(losersFinal?.winnerNextMatchId).toBe(grandFinalId);
    expect(losersFinal?.loserNextMatchId).toBeUndefined();
  });
});
