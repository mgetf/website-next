/**
 * Podium for one division once its champion is decided.
 * Single elimination stores 1st and 2nd. Double elimination also stores 3rd,
 * the loser of the losers final, when that match had a loser.
 * The saved format decides this. The division name does not.
 */

export type PodiumSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';
export type PodiumFormat = 'SINGLE_ELIM' | 'DOUBLE_ELIM';

export type PodiumSlot = {
  id: number;
  format: PodiumFormat;
  section: PodiumSection;
  round: number;
  position: number;
  team1Id: number | null;
  team2Id: number | null;
  isBye: boolean;
  winnerNextSlotId: number | null;
  winnerId: number | null;
};

export type PlayoffPodiumPlace = {
  place: 1 | 2 | 3;
  teamId: number;
};

export function planPlayoffPodium(slots: PodiumSlot[]): PlayoffPodiumPlace[] {
  if (slots.length === 0) return [];
  const format = slots[0].format;
  if (format === 'SINGLE_ELIM') return singleElimPodium(slots);
  return doubleElimPodium(slots);
}

function singleElimPodium(slots: PodiumSlot[]): PlayoffPodiumPlace[] {
  const final = slots
    .filter((slot) => slot.section === 'MAIN' && slot.winnerNextSlotId == null)
    .sort((a, b) => b.round - a.round || a.position - b.position)[0];
  if (!final) return [];
  return placesFromDecided(decided(final));
}

function doubleElimPodium(slots: PodiumSlot[]): PlayoffPodiumPlace[] {
  const reset = slots
    .filter((slot) => slot.section === 'GRAND_FINAL' && slot.round > 1)
    .sort((a, b) => b.round - a.round || a.position - b.position)[0];
  const grandFinal = slots.find(
    (slot) => slot.section === 'GRAND_FINAL' && slot.round === 1 && slot.position === 1,
  );

  let champion: DecidedMatch | null = null;
  if (reset) {
    champion = decided(reset);
    if (!champion) return [];
  } else if (grandFinal) {
    const result = decided(grandFinal);
    if (!result) return [];
    if (result.winnerId === grandFinal.team2Id) return [];
    champion = result;
  } else {
    const winnersFinal = slots
      .filter((slot) => slot.section === 'WINNERS' && slot.winnerNextSlotId == null)
      .sort((a, b) => b.round - a.round || a.position - b.position)[0];
    if (!winnersFinal) return [];
    return placesFromDecided(decided(winnersFinal));
  }

  const places = placesFromDecided(champion);
  const third = losersFinalLoser(slots);
  if (third != null) places.push({ place: 3, teamId: third });
  return places;
}

type DecidedMatch = { winnerId: number; loserId: number | null };

function decided(slot: PodiumSlot): DecidedMatch | null {
  if (slot.winnerId != null) {
    if (slot.winnerId === slot.team1Id) return { winnerId: slot.winnerId, loserId: slot.team2Id };
    if (slot.winnerId === slot.team2Id) return { winnerId: slot.winnerId, loserId: slot.team1Id };
    return null;
  }
  if (!slot.isBye) return null;
  if (slot.team1Id != null && slot.team2Id == null)
    return { winnerId: slot.team1Id, loserId: null };
  if (slot.team2Id != null && slot.team1Id == null)
    return { winnerId: slot.team2Id, loserId: null };
  return null;
}

function placesFromDecided(result: DecidedMatch | null): PlayoffPodiumPlace[] {
  if (!result) return [];
  const places: PlayoffPodiumPlace[] = [{ place: 1, teamId: result.winnerId }];
  if (result.loserId != null) places.push({ place: 2, teamId: result.loserId });
  return places;
}

function losersFinalLoser(slots: PodiumSlot[]): number | null {
  const grandFinalIds = new Set(
    slots.filter((slot) => slot.section === 'GRAND_FINAL').map((slot) => slot.id),
  );
  const losersFinal = slots.find(
    (slot) =>
      slot.section === 'LOSERS' &&
      slot.winnerNextSlotId != null &&
      grandFinalIds.has(slot.winnerNextSlotId),
  );
  if (!losersFinal) return null;
  return decided(losersFinal)?.loserId ?? null;
}
