/**
 * Bracket Topology Inference
 *
 * Historical EventMatch rows only encode advancement implicitly — through a
 * signed round number (winners positive / losers negative / grand final
 * zero) or, in at least one migrated event, only through free-text labels.
 * That implicit encoding is what makes rendering fragile (duplicate names,
 * renamed players, or unconventional round numbering all break it).
 *
 * This module derives the explicit `section` + `winnerNextMatchId` /
 * `loserNextMatchId` edges once, from the data that is already reliable：
 * which real player won which match, and which later match that same player
 * next appears in. It is used by the one-time historical backfill and by the
 * editor when cloning a published event into a draft.
 */

export type BracketSectionValue = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

export interface TopologyMatchPlayer {
  side: number;
  displayName: string;
  steamId?: string | null;
}

export interface TopologyMatchInput {
  id: number;
  round: number | null;
  orderNum: number;
  label: string | null;
  winnerSide: number | null;
  players: TopologyMatchPlayer[];
}

export interface TopologyResult {
  id: number;
  section: BracketSectionValue;
  winnerNextMatchId: number | null;
  winnerNextSide: 1 | 2 | null;
  loserNextMatchId: number | null;
  loserNextSide: 1 | 2 | null;
}

/**
 * A single-elimination stage has no winners/losers split — every match is MAIN.
 * A double-elimination stage is disambiguated first by label text (handles the
 * one event that only used unsigned rounds), then by round sign (the standard
 * convention used everywhere else).
 */
export function deriveSection(
  match: Pick<TopologyMatchInput, 'round' | 'label'>,
  format: 'SINGLE_ELIM' | 'DOUBLE_ELIM',
): BracketSectionValue {
  if (format === 'SINGLE_ELIM') return 'MAIN';

  const label = (match.label ?? '').toLowerCase();
  if (label.includes('grand final')) return 'GRAND_FINAL';
  if (label.includes('losers')) return 'LOSERS';
  if (label.includes('winners')) return 'WINNERS';

  if (match.round === 0 || match.round === null) return 'GRAND_FINAL';
  return match.round > 0 ? 'WINNERS' : 'LOSERS';
}

/**
 * Approximate chronological ordering key. Winners round N is assumed to
 * complete just before losers round N (the standard flow: WR1 → LR1 → WR2 →
 * LR2 → ...), with the grand final always last.
 */
function chronologyKey(section: BracketSectionValue, round: number | null): number {
  if (section === 'GRAND_FINAL') return Number.MAX_SAFE_INTEGER;
  const tier = Math.abs(round ?? 0);
  return section === 'LOSERS' ? tier * 2 + 1 : tier * 2;
}

/**
 * Infers explicit progression edges for every match in an elimination stage
 * by following participant identity forward in time: whoever won match A is
 * searched for in the next chronologically-ordered matches, and the first
 * match containing them becomes A's `winnerNextMatchId`. The same technique
 * finds where a WINNERS/MAIN match's loser drops into the LOSERS bracket.
 * LOSERS-section losers are eliminated (no further match), so their
 * `loserNextMatchId` is always left null.
 */
export function inferBracketTopology(
  matches: TopologyMatchInput[],
  format: 'SINGLE_ELIM' | 'DOUBLE_ELIM',
): TopologyResult[] {
  const withSection = matches.map((m) => ({
    ...m,
    section: deriveSection(m, format),
  }));

  const ordered = [...withSection].sort((a, b) => {
    const ak = chronologyKey(a.section, a.round);
    const bk = chronologyKey(b.section, b.round);
    if (ak !== bk) return ak - bk;
    return a.orderNum - b.orderNum;
  });

  function findNextAppearance(
    afterIndex: number,
    participant: TopologyMatchPlayer,
  ): { matchId: number; side: 1 | 2 } | null {
    for (let i = afterIndex + 1; i < ordered.length; i++) {
      const candidate = ordered[i];
      const found = candidate.players.find((player) =>
        participant.steamId
          ? player.steamId === participant.steamId
          : player.displayName === participant.displayName,
      );
      if (found) {
        return { matchId: candidate.id, side: found.side === 2 ? 2 : 1 };
      }
    }
    return null;
  }

  const results: TopologyResult[] = [];

  ordered.forEach((match, idx) => {
    let winnerNextMatchId: number | null = null;
    let winnerNextSide: 1 | 2 | null = null;
    let loserNextMatchId: number | null = null;
    let loserNextSide: 1 | 2 | null = null;

    if (match.winnerSide === 1 || match.winnerSide === 2) {
      const winner = match.players.find((p) => p.side === match.winnerSide);
      const loser = match.players.find((p) => p.side !== match.winnerSide);

      if (winner && winner.displayName !== 'BYE') {
        const next = findNextAppearance(idx, winner);
        if (next) {
          winnerNextMatchId = next.matchId;
          winnerNextSide = next.side;
        }
      }

      if (loser && loser.displayName !== 'BYE' && match.section !== 'LOSERS') {
        const next = findNextAppearance(idx, loser);
        if (next) {
          loserNextMatchId = next.matchId;
          loserNextSide = next.side;
        }
      }
    }

    results.push({
      id: match.id,
      section: match.section,
      winnerNextMatchId,
      winnerNextSide,
      loserNextMatchId,
      loserNextSide,
    });
  });

  return results;
}

/**
 * A stage claiming to be an elimination bracket but with no round data on any
 * match isn't structurally a bracket — it's a flat, ordered sequence (a
 * ladder or gauntlet-style qualifier). Treat it as CARD instead of forcing
 * elimination topology onto it.
 */
export function isStructurallyFlat(matches: Pick<TopologyMatchInput, 'round'>[]): boolean {
  return matches.length > 0 && matches.every((m) => m.round === null);
}
