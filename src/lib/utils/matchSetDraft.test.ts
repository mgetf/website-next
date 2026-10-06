import { describe, expect, it } from 'vitest';
import {
  parseByeTeamIds,
  parseMatchSetPairings,
  validateMatchSetDraftTeams,
} from './matchSetDraft';

describe('parseMatchSetPairings', () => {
  it('accepts integer team ids', () => {
    expect(
      parseMatchSetPairings([
        { homeTeamId: 1, awayTeamId: 2 },
        { homeTeamId: 3, awayTeamId: 4 },
      ]),
    ).toEqual([
      { homeTeamId: 1, awayTeamId: 2 },
      { homeTeamId: 3, awayTeamId: 4 },
    ]);
  });

  it('rejects a non-array payload', () => {
    expect(() => parseMatchSetPairings({ homeTeamId: 1 })).toThrow('Pairings must be an array');
  });

  it('rejects invalid team ids', () => {
    expect(() => parseMatchSetPairings([{ homeTeamId: 0, awayTeamId: 2 }])).toThrow(
      'invalid home team',
    );
  });
});

describe('parseByeTeamIds', () => {
  it('treats null as no byes', () => {
    expect(parseByeTeamIds(null)).toEqual([]);
  });

  it('rejects non-integers', () => {
    expect(() => parseByeTeamIds(['nope'])).toThrow('Bye team 1 is invalid');
  });
});

describe('validateMatchSetDraftTeams', () => {
  it('requires at least one pairing', () => {
    expect(() => validateMatchSetDraftTeams([], [])).toThrow('At least one match pairing');
  });

  it('rejects a team playing itself', () => {
    expect(() => validateMatchSetDraftTeams([{ homeTeamId: 1, awayTeamId: 1 }], [])).toThrow(
      'cannot play itself',
    );
  });

  it('rejects a team used twice', () => {
    expect(() =>
      validateMatchSetDraftTeams(
        [
          { homeTeamId: 1, awayTeamId: 2 },
          { homeTeamId: 2, awayTeamId: 3 },
        ],
        [],
      ),
    ).toThrow('appears in more than one pairing');
  });

  it('rejects a bye that is also paired', () => {
    expect(() => validateMatchSetDraftTeams([{ homeTeamId: 1, awayTeamId: 2 }], [1])).toThrow(
      'both paired and given a bye',
    );
  });

  it('accepts a valid set with a bye', () => {
    expect(() => validateMatchSetDraftTeams([{ homeTeamId: 1, awayTeamId: 2 }], [3])).not.toThrow();
  });
});
