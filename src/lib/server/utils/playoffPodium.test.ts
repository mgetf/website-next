import { describe, expect, it } from 'vitest';
import { planPlayoffPodium, type PodiumSlot } from './playoffPodium';

function slot(partial: Partial<PodiumSlot> & Pick<PodiumSlot, 'id'>): PodiumSlot {
  return {
    format: 'SINGLE_ELIM',
    section: 'MAIN',
    round: 1,
    position: 1,
    team1Id: null,
    team2Id: null,
    isBye: false,
    winnerNextSlotId: null,
    winnerId: null,
    ...partial,
  };
}

describe('planPlayoffPodium', () => {
  it('stores 1st and 2nd from a single-elim final and no 3rd', () => {
    const places = planPlayoffPodium([
      slot({
        id: 1,
        round: 2,
        team1Id: 10,
        team2Id: 20,
        winnerId: 10,
      }),
      slot({
        id: 2,
        section: 'LOSERS',
        format: 'SINGLE_ELIM',
        team1Id: 30,
        team2Id: 40,
        winnerId: 30,
        winnerNextSlotId: 1,
      }),
    ]);

    expect(places).toEqual([
      { place: 1, teamId: 10 },
      { place: 2, teamId: 20 },
    ]);
  });

  it('waits until the single-elim final has a winner', () => {
    expect(
      planPlayoffPodium([
        slot({
          id: 1,
          round: 2,
          team1Id: 10,
          team2Id: 20,
        }),
      ]),
    ).toEqual([]);
  });

  it('stores 3rd from the losers final when the winners champion takes the grand final', () => {
    const places = planPlayoffPodium([
      slot({
        id: 1,
        format: 'DOUBLE_ELIM',
        section: 'GRAND_FINAL',
        team1Id: 10,
        team2Id: 20,
        winnerId: 10,
      }),
      slot({
        id: 2,
        format: 'DOUBLE_ELIM',
        section: 'LOSERS',
        round: 4,
        team1Id: 30,
        team2Id: 20,
        winnerId: 20,
        winnerNextSlotId: 1,
      }),
    ]);

    expect(places).toEqual([
      { place: 1, teamId: 10 },
      { place: 2, teamId: 20 },
      { place: 3, teamId: 30 },
    ]);
  });

  it('waits for the reset when the losers champion wins the grand final', () => {
    expect(
      planPlayoffPodium([
        slot({
          id: 1,
          format: 'DOUBLE_ELIM',
          section: 'GRAND_FINAL',
          team1Id: 10,
          team2Id: 20,
          winnerId: 20,
        }),
        slot({
          id: 2,
          format: 'DOUBLE_ELIM',
          section: 'LOSERS',
          team1Id: 30,
          team2Id: 20,
          winnerId: 20,
          winnerNextSlotId: 1,
        }),
      ]),
    ).toEqual([]);
  });

  it('reads 1st and 2nd from the reset, and 3rd from the losers final', () => {
    const places = planPlayoffPodium([
      slot({
        id: 1,
        format: 'DOUBLE_ELIM',
        section: 'GRAND_FINAL',
        team1Id: 10,
        team2Id: 20,
        winnerId: 20,
      }),
      slot({
        id: 3,
        format: 'DOUBLE_ELIM',
        section: 'GRAND_FINAL',
        round: 2,
        team1Id: 10,
        team2Id: 20,
        winnerId: 20,
      }),
      slot({
        id: 2,
        format: 'DOUBLE_ELIM',
        section: 'LOSERS',
        team1Id: 30,
        team2Id: 40,
        winnerId: 40,
        winnerNextSlotId: 1,
      }),
    ]);

    expect(places).toEqual([
      { place: 1, teamId: 20 },
      { place: 2, teamId: 10 },
      { place: 3, teamId: 30 },
    ]);
  });

  it('stores 1st and 2nd from a two-team double-elim match and no 3rd', () => {
    expect(
      planPlayoffPodium([
        slot({
          id: 1,
          format: 'DOUBLE_ELIM',
          section: 'WINNERS',
          team1Id: 10,
          team2Id: 20,
          winnerId: 10,
        }),
      ]),
    ).toEqual([
      { place: 1, teamId: 10 },
      { place: 2, teamId: 20 },
    ]);
  });

  it('skips 3rd when the losers final was a bye', () => {
    expect(
      planPlayoffPodium([
        slot({
          id: 1,
          format: 'DOUBLE_ELIM',
          section: 'GRAND_FINAL',
          team1Id: 10,
          team2Id: 20,
          winnerId: 10,
        }),
        slot({
          id: 2,
          format: 'DOUBLE_ELIM',
          section: 'LOSERS',
          team1Id: 20,
          isBye: true,
          winnerNextSlotId: 1,
        }),
      ]),
    ).toEqual([
      { place: 1, teamId: 10 },
      { place: 2, teamId: 20 },
    ]);
  });
});
