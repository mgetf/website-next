import { compareStandingsTeams, type StandingsRecord } from '#lib/utils/standingsHighlight.js';

/**
 * Builds an empty playoff tree for one division.
 *
 * Round numbers start at 1 inside each section. Single elimination uses MAIN.
 * Double elimination uses WINNERS, LOSERS, and one GRAND_FINAL. The grand-final
 * reset is omitted until the losers champion actually beats the winners champion.
 *
 * A bye advances that team immediately. A later slot becomes a match now only
 * when both of its sides are already filled by those advances.
 */

export type PlayoffBracketFormat = 'SINGLE_ELIM' | 'DOUBLE_ELIM';
export type PlayoffBracketSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

export type PlayoffSlotDraft = {
  key: string;
  section: PlayoffBracketSection;
  round: number;
  position: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerNextKey: string | null;
  winnerNextSide: 1 | 2 | null;
  loserNextKey: string | null;
  loserNextSide: 1 | 2 | null;
  isBye: boolean;
};

export type PlayoffSeed = {
  id: number;
};

/** READY teams seed first, then wins, losses, and average points. Equal records break by team id. */
export function rankPlayoffField<T extends StandingsRecord & { id: number }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    const diff = compareStandingsTeams(a, b);
    return diff !== 0 ? diff : a.id - b.id;
  });
}

export function buildPlayoffBracket(
  format: PlayoffBracketFormat,
  seeds: PlayoffSeed[],
): PlayoffSlotDraft[] {
  if (seeds.length < 2) {
    throw new Error('A playoff bracket needs at least two teams');
  }

  const slots = format === 'SINGLE_ELIM' ? buildSingleElim(seeds) : buildDoubleElim(seeds);
  advanceByes(slots);
  return pruneUnfed(slots);
}

function buildSingleElim(seeds: PlayoffSeed[]): PlayoffSlotDraft[] {
  const size = nextPowerOfTwo(seeds.length);
  const order = firstRoundSeeds(size);
  const rounds = log2(size);
  const slots: PlayoffSlotDraft[] = [];

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 1; position <= count; position++) {
      const key = slotKey('MAIN', round, position);
      const isFinal = round === rounds;
      let team1Id: number | null = null;
      let team2Id: number | null = null;
      if (round === 1) {
        const pair = pairAt(order, seeds, position);
        team1Id = pair.team1Id;
        team2Id = pair.team2Id;
      }
      slots.push({
        key,
        section: 'MAIN',
        round,
        position,
        team1Id,
        team2Id,
        winnerNextKey: isFinal ? null : slotKey('MAIN', round + 1, Math.ceil(position / 2)),
        winnerNextSide: isFinal ? null : sideForPosition(position),
        loserNextKey: null,
        loserNextSide: null,
        isBye: false,
      });
    }
  }

  return slots;
}

function buildDoubleElim(seeds: PlayoffSeed[]): PlayoffSlotDraft[] {
  const size = nextPowerOfTwo(seeds.length);
  const order = firstRoundSeeds(size);
  const winnersRounds = log2(size);
  const slots: PlayoffSlotDraft[] = [];

  for (let round = 1; round <= winnersRounds; round++) {
    const count = size / 2 ** round;
    for (let position = 1; position <= count; position++) {
      const isFinal = round === winnersRounds;
      let team1Id: number | null = null;
      let team2Id: number | null = null;
      if (round === 1) {
        const pair = pairAt(order, seeds, position);
        team1Id = pair.team1Id;
        team2Id = pair.team2Id;
      }
      slots.push({
        key: slotKey('WINNERS', round, position),
        section: 'WINNERS',
        round,
        position,
        team1Id,
        team2Id,
        winnerNextKey: isFinal ? null : slotKey('WINNERS', round + 1, Math.ceil(position / 2)),
        winnerNextSide: isFinal ? null : sideForPosition(position),
        loserNextKey: null,
        loserNextSide: null,
        isBye: false,
      });
    }
  }

  if (winnersRounds === 1) return slots;

  const losersRounds = 2 * (winnersRounds - 1);
  let losersCount = size / 4;
  for (let round = 1; round <= losersRounds; round++) {
    for (let position = 1; position <= losersCount; position++) {
      const isLast = round === losersRounds;
      const nextIsDropRound = round % 2 === 1;
      slots.push({
        key: slotKey('LOSERS', round, position),
        section: 'LOSERS',
        round,
        position,
        team1Id: null,
        team2Id: null,
        winnerNextKey: isLast
          ? slotKey('GRAND_FINAL', 1, 1)
          : nextIsDropRound
            ? slotKey('LOSERS', round + 1, position)
            : slotKey('LOSERS', round + 1, Math.ceil(position / 2)),
        winnerNextSide: isLast ? 2 : nextIsDropRound ? 1 : sideForPosition(position),
        loserNextKey: null,
        loserNextSide: null,
        isBye: false,
      });
    }
    if (round % 2 === 0) losersCount /= 2;
  }

  for (let round = 1; round <= winnersRounds; round++) {
    const count = size / 2 ** round;
    for (let position = 1; position <= count; position++) {
      const source = slots.find((slot) => slot.key === slotKey('WINNERS', round, position));
      if (!source) continue;
      if (round === 1) {
        source.loserNextKey = slotKey('LOSERS', 1, Math.ceil(position / 2));
        source.loserNextSide = sideForPosition(position);
      } else {
        source.loserNextKey = slotKey('LOSERS', 2 * (round - 1), position);
        source.loserNextSide = 2;
      }
    }
  }

  const winnersFinal = slots.find((slot) => slot.key === slotKey('WINNERS', winnersRounds, 1));
  if (winnersFinal) {
    winnersFinal.winnerNextKey = slotKey('GRAND_FINAL', 1, 1);
    winnersFinal.winnerNextSide = 1;
  }

  slots.push({
    key: slotKey('GRAND_FINAL', 1, 1),
    section: 'GRAND_FINAL',
    round: 1,
    position: 1,
    team1Id: null,
    team2Id: null,
    winnerNextKey: null,
    winnerNextSide: null,
    loserNextKey: null,
    loserNextSide: null,
    isBye: false,
  });

  return slots;
}

function advanceByes(slots: PlayoffSlotDraft[]) {
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));
  let progressed = true;
  while (progressed) {
    progressed = false;
    const incoming = incomingSides(slots);
    for (const slot of slots) {
      if (slot.isBye) continue;
      const teamId = slot.team1Id ?? slot.team2Id;
      const oneTeam = (slot.team1Id == null) !== (slot.team2Id == null);
      if (!oneTeam || teamId == null) continue;
      const emptySide: 1 | 2 = slot.team1Id == null ? 1 : 2;
      if (incoming.get(slot.key)?.has(emptySide)) continue;
      slot.isBye = true;
      slot.loserNextKey = null;
      slot.loserNextSide = null;
      placeWinner(byKey, slot, teamId);
      progressed = true;
    }
  }
}

function pruneUnfed(slots: PlayoffSlotDraft[]): PlayoffSlotDraft[] {
  let current = slots;
  let removed = true;
  while (removed) {
    const incoming = new Set<string>();
    for (const slot of current) {
      if (slot.winnerNextKey) incoming.add(slot.winnerNextKey);
      if (slot.loserNextKey) incoming.add(slot.loserNextKey);
    }
    const next = current.filter(
      (slot) => slot.team1Id != null || slot.team2Id != null || incoming.has(slot.key),
    );
    removed = next.length !== current.length;
    current = next;
  }

  const keys = new Set(current.map((slot) => slot.key));
  for (const slot of current) {
    if (slot.winnerNextKey && !keys.has(slot.winnerNextKey)) {
      slot.winnerNextKey = null;
      slot.winnerNextSide = null;
    }
    if (slot.loserNextKey && !keys.has(slot.loserNextKey)) {
      slot.loserNextKey = null;
      slot.loserNextSide = null;
    }
  }
  return current;
}

function placeWinner(byKey: Map<string, PlayoffSlotDraft>, slot: PlayoffSlotDraft, teamId: number) {
  if (!slot.winnerNextKey || !slot.winnerNextSide) return;
  const destination = byKey.get(slot.winnerNextKey);
  if (!destination) return;
  const current = slot.winnerNextSide === 1 ? destination.team1Id : destination.team2Id;
  if (current != null && current !== teamId) {
    throw new Error(`Playoff slot ${destination.key} already has a different team`);
  }
  if (slot.winnerNextSide === 1) destination.team1Id = teamId;
  else destination.team2Id = teamId;
}

function incomingSides(slots: PlayoffSlotDraft[]): Map<string, Set<1 | 2>> {
  const incoming = new Map<string, Set<1 | 2>>();
  for (const slot of slots) {
    if (slot.winnerNextKey && slot.winnerNextSide) {
      const sides = incoming.get(slot.winnerNextKey) ?? new Set<1 | 2>();
      sides.add(slot.winnerNextSide);
      incoming.set(slot.winnerNextKey, sides);
    }
    if (slot.loserNextKey && slot.loserNextSide) {
      const sides = incoming.get(slot.loserNextKey) ?? new Set<1 | 2>();
      sides.add(slot.loserNextSide);
      incoming.set(slot.loserNextKey, sides);
    }
  }
  return incoming;
}

function pairAt(order: number[], seeds: PlayoffSeed[], position: number) {
  const seedA = order[(position - 1) * 2];
  const seedB = order[(position - 1) * 2 + 1];
  return {
    team1Id: teamForSeed(seeds, seedA),
    team2Id: teamForSeed(seeds, seedB),
  };
}

function teamForSeed(seeds: PlayoffSeed[], seed: number): number | null {
  return seed <= seeds.length ? seeds[seed - 1].id : null;
}

function sideForPosition(position: number): 1 | 2 {
  return position % 2 === 1 ? 1 : 2;
}

function slotKey(section: PlayoffBracketSection, round: number, position: number): string {
  return `${section}-${round}-${position}`;
}

function nextPowerOfTwo(count: number): number {
  let size = 1;
  while (size < count) size *= 2;
  return size;
}

function log2(size: number): number {
  let rounds = 0;
  let value = size;
  while (value > 1) {
    value /= 2;
    rounds += 1;
  }
  return rounds;
}

/** 1-based seed numbers in first-round order: 1 vs last, then the fold that keeps 1 and 2 apart. */
function firstRoundSeeds(size: number): number[] {
  let round = [1, 2];
  while (round.length < size) {
    const next: number[] = [];
    const sum = round.length * 2 + 1;
    for (let index = 0; index < round.length; index += 2) {
      const home = round[index];
      const away = round[index + 1];
      next.push(home, sum - home, away, sum - away);
    }
    round = next;
  }
  return round;
}
