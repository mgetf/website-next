import { describe, expect, it } from 'vitest';
import { planPlayoffAdvance, PlayoffAdvanceError, type AdvanceSlot } from './playoffAdvance';

function slot(partial: Partial<AdvanceSlot> & Pick<AdvanceSlot, 'id'>): AdvanceSlot {
  return {
    section: 'MAIN',
    round: 1,
    position: 1,
    team1Id: null,
    team2Id: null,
    winnerNextSlotId: null,
    winnerNextSide: null,
    loserNextSlotId: null,
    loserNextSide: null,
    hasMatch: false,
    isBye: false,
    ...partial,
  };
}

describe('planPlayoffAdvance', () => {
  const semis = [
    slot({
      id: 1,
      position: 1,
      team1Id: 10,
      team2Id: 40,
      hasMatch: true,
      winnerNextSlotId: 3,
      winnerNextSide: 1,
    }),
    slot({
      id: 2,
      position: 2,
      team1Id: 20,
      team2Id: 30,
      hasMatch: true,
      winnerNextSlotId: 3,
      winnerNextSide: 2,
    }),
    slot({ id: 3, round: 2, position: 1 }),
  ];

  it('parks the winner until the other semi is played', () => {
    const plan = planPlayoffAdvance(semis, 1, 10);
    expect(plan.matches).toEqual([]);
    expect(plan.reset).toBeNull();
    expect(plan.updates).toEqual([
      { slotId: 3, team1Id: 10, team2Id: null, isBye: false, clearLoserArrow: false },
    ]);
  });

  it('creates the next match once both teams have arrived', () => {
    const waiting = semis.map((candidate) =>
      candidate.id === 3 ? { ...candidate, team1Id: 10 } : candidate,
    );
    const plan = planPlayoffAdvance(waiting, 2, 20);
    expect(plan.matches).toEqual([{ slotId: 3, homeTeamId: 10, awayTeamId: 20 }]);
  });

  it('advances through a side that will never receive a team', () => {
    const slots = [
      slot({
        id: 1,
        section: 'WINNERS',
        team1Id: 10,
        team2Id: 40,
        hasMatch: true,
        loserNextSlotId: 2,
        loserNextSide: 2,
      }),
      slot({
        id: 2,
        section: 'LOSERS',
        winnerNextSlotId: 3,
        winnerNextSide: 1,
      }),
      slot({ id: 3, section: 'LOSERS', round: 2 }),
      slot({
        id: 4,
        section: 'WINNERS',
        round: 2,
        hasMatch: true,
        team1Id: 50,
        team2Id: 60,
        loserNextSlotId: 3,
        loserNextSide: 2,
      }),
    ];

    const plan = planPlayoffAdvance(slots, 1, 10);
    expect(plan.matches).toEqual([]);
    expect(plan.updates).toEqual([
      { slotId: 2, team1Id: null, team2Id: 40, isBye: true, clearLoserArrow: true },
      { slotId: 3, team1Id: 40, team2Id: null, isBye: false, clearLoserArrow: false },
    ]);
  });

  it('schedules the reset only when the losers champion wins the grand final', () => {
    const grandFinal = slot({
      id: 1,
      section: 'GRAND_FINAL',
      team1Id: 10,
      team2Id: 20,
      hasMatch: true,
    });
    expect(planPlayoffAdvance([grandFinal], 1, 10).reset).toBeNull();
    expect(planPlayoffAdvance([grandFinal], 1, 20).reset).toEqual({ team1Id: 10, team2Id: 20 });
  });

  it('leaves an existing reset alone', () => {
    const plan = planPlayoffAdvance(
      [
        slot({
          id: 1,
          section: 'GRAND_FINAL',
          team1Id: 10,
          team2Id: 20,
          hasMatch: true,
        }),
        slot({ id: 2, section: 'GRAND_FINAL', round: 2, team1Id: 10, team2Id: 20, hasMatch: true }),
      ],
      1,
      20,
    );
    expect(plan.reset).toBeNull();
    expect(plan.matches).toEqual([]);
  });

  it('refuses to replace a team that already advanced', () => {
    const filled = semis.map((candidate) =>
      candidate.id === 3 ? { ...candidate, team1Id: 10 } : candidate,
    );
    expect(() => planPlayoffAdvance(filled, 1, 40)).toThrow(PlayoffAdvanceError);
  });
});
