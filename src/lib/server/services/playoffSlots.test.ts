import { describe, expect, it } from 'vitest';
import { isBracketOutboxKey } from './playoffSlots';

describe('isBracketOutboxKey', () => {
  const SEASON = 23;
  const DIVISION = 40;
  const MATCHES = [5586, 5587];

  it('matches notices for the bracket matches', () => {
    expect(isBracketOutboxKey('playoff.match_created:5586:dm:123', SEASON, DIVISION, MATCHES)).toBe(
      true,
    );
    expect(
      isBracketOutboxKey('playoff.match_created:5586:channel:playoffs', SEASON, DIVISION, MATCHES),
    ).toBe(true);
    expect(
      isBracketOutboxKey('playoff.score_confirmed:5587:1-3:dm:123', SEASON, DIVISION, MATCHES),
    ).toBe(true);
    expect(
      isBracketOutboxKey('playoff.team_eliminated:2892:5586:dm:123', SEASON, DIVISION, MATCHES),
    ).toBe(true);
    expect(
      isBracketOutboxKey(
        'match.reminder:5586:24h:2026-11-24T22:30:00.000Z:dm:123',
        SEASON,
        DIVISION,
        MATCHES,
      ),
    ).toBe(true);
  });

  it('matches the bracket complete notice for this season and division', () => {
    expect(
      isBracketOutboxKey('playoff.bracket_complete:23:40:dm:123', SEASON, DIVISION, MATCHES),
    ).toBe(true);
  });

  it('leaves other brackets and regular matches alone', () => {
    expect(
      isBracketOutboxKey('playoff.bracket_complete:23:41:dm:123', SEASON, DIVISION, MATCHES),
    ).toBe(false);
    expect(isBracketOutboxKey('playoff.match_created:5588:dm:123', SEASON, DIVISION, MATCHES)).toBe(
      false,
    );
    expect(
      isBracketOutboxKey('playoff.team_eliminated:2892:5588:dm:123', SEASON, DIVISION, MATCHES),
    ).toBe(false);
    expect(
      isBracketOutboxKey(
        'match.reminder:4371:24h:2026-11-24T22:30:00.000Z:dm:123',
        SEASON,
        DIVISION,
        MATCHES,
      ),
    ).toBe(false);
  });
});
