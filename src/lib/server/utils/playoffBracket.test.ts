import { describe, expect, it } from 'vitest';
import { buildPlayoffBracket, rankPlayoffField, type PlayoffSlotDraft } from './playoffBracket';

function seeds(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

function slot(slots: PlayoffSlotDraft[], key: string) {
  const found = slots.find((candidate) => candidate.key === key);
  expect(found, key).toBeDefined();
  return found!;
}

function assertWired(slots: PlayoffSlotDraft[]) {
  const keys = new Set(slots.map((candidate) => candidate.key));
  expect(keys.size).toBe(slots.length);
  for (const candidate of slots) {
    if (candidate.winnerNextKey) {
      expect(keys.has(candidate.winnerNextKey)).toBe(true);
      expect(candidate.winnerNextSide === 1 || candidate.winnerNextSide === 2).toBe(true);
      expect(candidate.winnerNextKey).not.toBe(candidate.key);
    } else {
      expect(candidate.winnerNextSide).toBeNull();
    }
    if (candidate.loserNextKey) {
      expect(keys.has(candidate.loserNextKey)).toBe(true);
      expect(candidate.loserNextSide === 1 || candidate.loserNextSide === 2).toBe(true);
      expect(candidate.loserNextKey).not.toBe(candidate.key);
    } else {
      expect(candidate.loserNextSide).toBeNull();
    }
    expect(candidate.team1Id === candidate.team2Id && candidate.team1Id != null).toBe(false);
  }
}

describe('buildPlayoffBracket', () => {
  it('seeds ready teams ahead of a stronger record that is not ready', () => {
    const ranked = rankPlayoffField([
      { id: 9, status: 'UNREADY', wins: 5, losses: 0, points: 20 },
      { id: 2, status: 'READY', wins: 0, losses: 4, points: 1 },
      { id: 4, status: 'READY', wins: 0, losses: 4, points: 1 },
    ]);
    expect(ranked.map((team) => team.id)).toEqual([2, 4, 9]);
  });

  it('refuses a bracket with fewer than two teams', () => {
    expect(() => buildPlayoffBracket('SINGLE_ELIM', seeds(1))).toThrow(/at least two/);
  });

  it('seeds an 8-team single elimination so 1 and 2 meet in the final', () => {
    const slots = buildPlayoffBracket('SINGLE_ELIM', seeds(8));
    assertWired(slots);
    expect(slots).toHaveLength(7);
    expect(slot(slots, 'MAIN-1-1')).toMatchObject({ team1Id: 1, team2Id: 8, isBye: false });
    expect(slot(slots, 'MAIN-1-2')).toMatchObject({ team1Id: 4, team2Id: 5 });
    expect(slot(slots, 'MAIN-1-3')).toMatchObject({ team1Id: 2, team2Id: 7 });
    expect(slot(slots, 'MAIN-1-4')).toMatchObject({ team1Id: 3, team2Id: 6 });
    expect(slot(slots, 'MAIN-1-1').winnerNextKey).toBe('MAIN-2-1');
    expect(slot(slots, 'MAIN-1-2').winnerNextKey).toBe('MAIN-2-1');
    expect(slot(slots, 'MAIN-1-2').winnerNextSide).toBe(2);
    expect(slot(slots, 'MAIN-3-1')).toMatchObject({
      team1Id: null,
      team2Id: null,
      winnerNextKey: null,
    });
    expect(slots.some((candidate) => candidate.section !== 'MAIN')).toBe(false);
  });

  it('advances byes and leaves the next round waiting on the real match', () => {
    const slots = buildPlayoffBracket('SINGLE_ELIM', seeds(6));
    assertWired(slots);
    expect(slot(slots, 'MAIN-1-1')).toMatchObject({ team1Id: 1, team2Id: null, isBye: true });
    expect(slot(slots, 'MAIN-1-3')).toMatchObject({ team1Id: 2, team2Id: null, isBye: true });
    expect(slot(slots, 'MAIN-1-1').loserNextKey).toBeNull();
    expect(slot(slots, 'MAIN-2-1')).toMatchObject({ team1Id: 1, team2Id: null, isBye: false });
    expect(slot(slots, 'MAIN-2-2')).toMatchObject({ team1Id: 2, team2Id: null, isBye: false });
    expect(slot(slots, 'MAIN-1-2')).toMatchObject({ team1Id: 4, team2Id: 5, isBye: false });
    expect(slot(slots, 'MAIN-3-1')).toMatchObject({ team1Id: null, team2Id: null });
  });

  it('makes a two-team bracket a single final', () => {
    const slots = buildPlayoffBracket('DOUBLE_ELIM', seeds(2));
    assertWired(slots);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      section: 'WINNERS',
      team1Id: 1,
      team2Id: 2,
      winnerNextKey: null,
      loserNextKey: null,
      isBye: false,
    });
  });

  it('wires a 4-team double elimination into one grand final', () => {
    const slots = buildPlayoffBracket('DOUBLE_ELIM', seeds(4));
    assertWired(slots);
    expect(slots.filter((candidate) => candidate.section === 'GRAND_FINAL')).toHaveLength(1);
    expect(slot(slots, 'WINNERS-1-1')).toMatchObject({
      team1Id: 1,
      team2Id: 4,
      winnerNextKey: 'WINNERS-2-1',
      winnerNextSide: 1,
      loserNextKey: 'LOSERS-1-1',
      loserNextSide: 1,
    });
    expect(slot(slots, 'WINNERS-1-2')).toMatchObject({
      team1Id: 2,
      team2Id: 3,
      loserNextKey: 'LOSERS-1-1',
      loserNextSide: 2,
    });
    expect(slot(slots, 'WINNERS-2-1')).toMatchObject({
      winnerNextKey: 'GRAND_FINAL-1-1',
      winnerNextSide: 1,
      loserNextKey: 'LOSERS-2-1',
      loserNextSide: 2,
    });
    expect(slot(slots, 'LOSERS-1-1').winnerNextKey).toBe('LOSERS-2-1');
    expect(slot(slots, 'LOSERS-2-1')).toMatchObject({
      winnerNextKey: 'GRAND_FINAL-1-1',
      winnerNextSide: 2,
      loserNextKey: null,
    });
    expect(slot(slots, 'GRAND_FINAL-1-1')).toMatchObject({
      team1Id: null,
      team2Id: null,
      winnerNextKey: null,
      loserNextKey: null,
    });
  });

  it('drops a losers slot that only byes would have fed, and plays the bye winners now', () => {
    const slots = buildPlayoffBracket('DOUBLE_ELIM', seeds(5));
    assertWired(slots);
    expect(slots.some((candidate) => candidate.key === 'LOSERS-1-2')).toBe(false);
    expect(slot(slots, 'WINNERS-2-2')).toMatchObject({
      team1Id: 2,
      team2Id: 3,
      isBye: false,
    });
    expect(slot(slots, 'WINNERS-1-1').loserNextKey).toBeNull();
    expect(slot(slots, 'GRAND_FINAL-1-1').winnerNextKey).toBeNull();
  });
});
