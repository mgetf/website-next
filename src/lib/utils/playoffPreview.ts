import type { BracketMatch, BracketRound, EliminationBracketData } from '#lib/types/bracket.js';
import {
  buildPlayoffBracket,
  type PlayoffBracketFormat,
  type PlayoffSlotDraft,
} from '#lib/utils/playoffBracket.js';
import { formatPlayoffSlotLabel, type PlayoffSlotSection } from '#lib/utils/playoffs.js';

/**
 * The bracket a seeding would make, as the data the bracket renderer draws.
 * Used by the picker so admins see the matchups before they generate. It runs
 * the same builder as generation, so what you see is what you get.
 */

export type PreviewTeam = { id: number; label: string };

function sideOf(
  teamId: number | null,
  isBye: boolean,
  seeds: Map<number, PreviewTeam & { seed: number }>,
) {
  if (teamId == null) return { label: isBye ? 'BYE' : 'TBD' };
  const team = seeds.get(teamId);
  return team ? { label: team.label, seed: team.seed } : { label: 'TBD' };
}

export function playoffPreviewBracket(
  format: PlayoffBracketFormat,
  teams: PreviewTeam[],
): EliminationBracketData | null {
  if (teams.length < 2) return null;

  const seeds = new Map(teams.map((team, index) => [team.id, { ...team, seed: index + 1 }]));
  const slots = buildPlayoffBracket(format, teams);

  const highest = new Map<string, number>();
  for (const slot of slots) {
    highest.set(slot.section, Math.max(highest.get(slot.section) ?? 0, slot.round));
  }

  const toMatch = (slot: PlayoffSlotDraft, position: number): BracketMatch => ({
    id: slot.key,
    round: slot.round,
    position,
    side1: sideOf(slot.team1Id, slot.isBye, seeds),
    side2: sideOf(slot.team2Id, slot.isBye, seeds),
    status: 'upcoming',
    isBye: slot.isBye,
    winnerNextMatchId: slot.winnerNextKey ?? undefined,
  });

  const roundsOf = (section: PlayoffSlotDraft['section']): BracketRound[] => {
    const inSection = slots.filter((slot) => slot.section === section);
    const numbers = [...new Set(inSection.map((slot) => slot.round))].sort((a, b) => a - b);
    return numbers.map((number) => ({
      number,
      label: formatPlayoffSlotLabel(
        section as PlayoffSlotSection,
        number,
        highest.get(section) ?? number,
      ),
      matches: inSection
        .filter((slot) => slot.round === number)
        .sort((a, b) => a.position - b.position)
        .map((slot, index) => toMatch(slot, index + 1)),
    }));
  };

  if (format === 'SINGLE_ELIM') {
    return { format: 'single_elim', status: 'upcoming', rounds: roundsOf('MAIN') };
  }

  const grand = slots.filter((slot) => slot.section === 'GRAND_FINAL');
  const losers = roundsOf('LOSERS');
  return {
    format: 'double_elim',
    status: 'upcoming',
    rounds: roundsOf('WINNERS'),
    loserRounds: losers.length > 0 ? losers : undefined,
    grandFinal:
      grand.length > 0
        ? {
            number: 0,
            label: 'Grand Final',
            matches: grand.map((slot, index) => toMatch(slot, index + 1)),
          }
        : undefined,
  };
}
