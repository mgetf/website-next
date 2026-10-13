/**
 * Decides how a finished playoff match moves teams along the stored arrows.
 * A side with no arrow and no team stays empty, so the team that did arrive
 * advances alone. The grand-final reset appears only when the losers champion
 * beats the winners champion.
 */

export type AdvanceSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

export type AdvanceSlot = {
  id: number;
  section: AdvanceSection;
  round: number;
  position: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerNextSlotId: number | null;
  winnerNextSide: 1 | 2 | null;
  loserNextSlotId: number | null;
  loserNextSide: 1 | 2 | null;
  hasMatch: boolean;
  isBye: boolean;
};

export type PlayoffSlotUpdate = {
  slotId: number;
  team1Id: number | null;
  team2Id: number | null;
  isBye: boolean;
  clearLoserArrow: boolean;
};

export type PlayoffMatchToCreate = {
  slotId: number;
  homeTeamId: number;
  awayTeamId: number;
};

export type PlayoffAdvancePlan = {
  updates: PlayoffSlotUpdate[];
  matches: PlayoffMatchToCreate[];
  reset: { team1Id: number; team2Id: number } | null;
};

export class PlayoffAdvanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayoffAdvanceError';
  }
}

type WorkingSlot = AdvanceSlot & { clearLoserArrow: boolean };

export function planPlayoffAdvance(
  slots: AdvanceSlot[],
  completedSlotId: number,
  winnerId: number,
): PlayoffAdvancePlan {
  const state = new Map<number, WorkingSlot>(
    slots.map((slot) => [slot.id, { ...slot, clearLoserArrow: false }]),
  );
  const completed = state.get(completedSlotId);
  if (!completed) throw new PlayoffAdvanceError('Playoff slot not found for this match');

  const loserId = otherTeam(completed, winnerId);
  if (loserId == null) {
    throw new PlayoffAdvanceError('The winner is not one of the teams in this playoff slot');
  }

  const updates = new Map<number, PlayoffSlotUpdate>();
  const matches: PlayoffMatchToCreate[] = [];
  const advancing = new Set<number>();

  function remember(slot: WorkingSlot) {
    updates.set(slot.id, {
      slotId: slot.id,
      team1Id: slot.team1Id,
      team2Id: slot.team2Id,
      isBye: slot.isBye,
      clearLoserArrow: slot.clearLoserArrow,
    });
  }

  function settle(slot: WorkingSlot) {
    if (slot.hasMatch) return;
    if (slot.team1Id != null && slot.team2Id != null) {
      matches.push({
        slotId: slot.id,
        homeTeamId: slot.team1Id,
        awayTeamId: slot.team2Id,
      });
      slot.hasMatch = true;
      remember(slot);
      return;
    }

    const teamId = slot.team1Id ?? slot.team2Id;
    if (teamId == null) return;
    const emptySide: 1 | 2 = slot.team1Id == null ? 1 : 2;
    if (sideHasFeeder(state, slot.id, emptySide)) return;

    if (!slot.isBye) {
      slot.isBye = true;
      slot.clearLoserArrow = true;
      slot.loserNextSlotId = null;
      slot.loserNextSide = null;
      remember(slot);
    }

    if (!slot.winnerNextSlotId || !slot.winnerNextSide) return;
    if (advancing.has(slot.id)) {
      throw new PlayoffAdvanceError('Playoff bye points back at itself');
    }
    advancing.add(slot.id);
    place(slot.winnerNextSlotId, slot.winnerNextSide, teamId);
    advancing.delete(slot.id);
  }

  function place(slotId: number, side: 1 | 2, teamId: number) {
    const slot = state.get(slotId);
    if (!slot) throw new PlayoffAdvanceError('Playoff arrow points at a missing slot');
    const current = side === 1 ? slot.team1Id : slot.team2Id;
    if (current != null && current !== teamId) {
      throw new PlayoffAdvanceError('This playoff result already sent a different team forward');
    }
    if (current == null) {
      if (side === 1) slot.team1Id = teamId;
      else slot.team2Id = teamId;
      remember(slot);
    }
    settle(slot);
  }

  if (completed.winnerNextSlotId && completed.winnerNextSide) {
    place(completed.winnerNextSlotId, completed.winnerNextSide, winnerId);
  }
  if (!completed.isBye && completed.loserNextSlotId && completed.loserNextSide) {
    place(completed.loserNextSlotId, completed.loserNextSide, loserId);
  }

  const resetAlreadyExists = [...state.values()].some(
    (slot) => slot.section === 'GRAND_FINAL' && (slot.round !== 1 || slot.position !== 1),
  );
  const losersChampionWon =
    completed.section === 'GRAND_FINAL' &&
    completed.round === 1 &&
    completed.position === 1 &&
    winnerId === completed.team2Id &&
    completed.team1Id != null &&
    completed.team2Id != null;

  return {
    updates: [...updates.values()],
    matches,
    reset:
      losersChampionWon && !resetAlreadyExists
        ? { team1Id: completed.team1Id as number, team2Id: completed.team2Id as number }
        : null,
  };
}

function otherTeam(slot: AdvanceSlot, winnerId: number): number | null {
  if (winnerId === slot.team1Id) return slot.team2Id;
  if (winnerId === slot.team2Id) return slot.team1Id;
  return null;
}

function sideHasFeeder(state: Map<number, WorkingSlot>, slotId: number, side: 1 | 2): boolean {
  for (const slot of state.values()) {
    if (slot.winnerNextSlotId === slotId && slot.winnerNextSide === side) return true;
    if (slot.loserNextSlotId === slotId && slot.loserNextSide === side) return true;
  }
  return false;
}
