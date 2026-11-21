import type { BracketMatch, BracketRound, EliminationBracketData } from '#lib/types/bracket.js';

/**
 * Lays out an elimination bracket as plain coordinates, with no DOM measuring.
 *
 * A match sits level with the matches that feed it, so lines are the same at
 * any size and the server can render the whole bracket. Rounds are columns.
 * Winners and losers brackets are stacked, and the grand final sits to the
 * right between them.
 */

export const BRACKET_CARD_WIDTH = 192;
export const BRACKET_CARD_HEIGHT = 92;
export const BRACKET_COLUMN_GAP = 44;
export const BRACKET_ROW_GAP = 14;
export const BRACKET_HEADER_HEIGHT = 30;
export const BRACKET_SECTION_GAP = 36;

const PITCH_X = BRACKET_CARD_WIDTH + BRACKET_COLUMN_GAP;
const PITCH_Y = BRACKET_CARD_HEIGHT + BRACKET_ROW_GAP;

export type BracketSectionKey = 'winners' | 'losers' | 'grand-final';

export type BracketNode = {
  id: string;
  section: BracketSectionKey;
  x: number;
  y: number;
  match: BracketMatch;
};

export type BracketEdge = {
  key: string;
  from: string;
  to: string;
  /** Path through the middle of the gap, with the corners rounded. */
  d: string;
};

export type BracketHeader = {
  key: string;
  label: string;
  x: number;
  y: number;
};

export type BracketLayout = {
  width: number;
  height: number;
  nodes: BracketNode[];
  edges: BracketEdge[];
  headers: BracketHeader[];
  sectionLabels: Array<{ key: string; label: string; y: number }>;
};

type Placed = { id: string; y: number };

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Vertical position of every match in one stacked section, top at 0.
 * A match is level with the earlier-round matches that lead into it. A match
 * with nothing leading in goes under the one before it.
 */
function placeSection(rounds: BracketRound[], feeders: Map<string, string[]>): Map<string, number> {
  const positions = new Map<string, number>();
  let previous: Placed[] = [];

  for (const round of rounds) {
    const raw = round.matches.map((match, index): number | null => {
      const id = String(match.id);
      const known = (feeders.get(id) ?? [])
        .filter((feeder) => previous.some((placed) => placed.id === feeder))
        .map((feeder) => positions.get(feeder))
        .filter((y): y is number => y !== undefined);
      if (known.length > 0) return mean(known);

      if (previous.length === round.matches.length && previous[index]) return previous[index].y;
      if (previous.length === round.matches.length * 2) {
        const a = previous[index * 2];
        const b = previous[index * 2 + 1];
        if (a && b) return (a.y + b.y) / 2;
      }
      return null;
    });

    let floor = -PITCH_Y;
    const placed: Placed[] = round.matches.map((match, index) => {
      const wanted = raw[index];
      const y = Math.max(wanted ?? floor + PITCH_Y, floor + PITCH_Y);
      floor = y;
      return { id: String(match.id), y };
    });

    for (const item of placed) positions.set(item.id, item.y);
    previous = placed;
  }

  return positions;
}

function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M ${x1} ${y1} H ${x2}`;
  const mid = x1 + (x2 - x1) / 2;
  const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 4);
  const dir = y2 > y1 ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `H ${mid - r}`,
    `Q ${mid} ${y1} ${mid} ${y1 + dir * r}`,
    `V ${y2 - dir * r}`,
    `Q ${mid} ${y2} ${mid + r} ${y2}`,
    `H ${x2}`,
  ].join(' ');
}

/**
 * Where each match's winner goes next. Stored arrows win. A bracket without
 * them (older events) is read from its shape: a round half the size pairs up
 * its matches, a round of the same size runs straight across, and the last
 * round of each side runs into the grand final.
 */
function winnerTargets(data: EliminationBracketData): Map<string, string> {
  const next = new Map<string, string>();
  const grand = data.grandFinal?.matches ?? [];

  const sides: BracketRound[][] = [data.rounds];
  if (data.loserRounds && data.loserRounds.length > 0) sides.push(data.loserRounds);

  for (const rounds of sides) {
    rounds.forEach((round, roundIndex) => {
      const following = rounds[roundIndex + 1];
      round.matches.forEach((match, index) => {
        const id = String(match.id);
        if (match.winnerNextMatchId !== undefined) {
          next.set(id, String(match.winnerNextMatchId));
          return;
        }
        let target: BracketMatch | undefined;
        if (following) {
          if (following.matches.length * 2 === round.matches.length) {
            target = following.matches[Math.floor(index / 2)];
          } else if (following.matches.length === round.matches.length) {
            target = following.matches[index];
          } else if (following.matches.length * 2 > round.matches.length) {
            target =
              following.matches[Math.min(Math.floor(index / 2), following.matches.length - 1)];
          }
        } else if (grand.length > 0) {
          target = grand[0];
        }
        if (target) next.set(id, String(target.id));
      });
    });
  }

  grand.forEach((match, index) => {
    const id = String(match.id);
    if (match.winnerNextMatchId !== undefined) next.set(id, String(match.winnerNextMatchId));
    else if (grand[index + 1]) next.set(id, String(grand[index + 1].id));
  });

  return next;
}

export function layoutEliminationBracket(data: EliminationBracketData): BracketLayout {
  const nodes: BracketNode[] = [];
  const headers: BracketHeader[] = [];
  const sectionLabels: BracketLayout['sectionLabels'] = [];

  const sections: Array<{ key: BracketSectionKey; label: string | null; rounds: BracketRound[] }> =
    [
      {
        key: 'winners',
        label: data.format === 'double_elim' ? 'Winners Bracket' : null,
        rounds: data.rounds,
      },
    ];
  if (data.loserRounds && data.loserRounds.length > 0) {
    sections.push({ key: 'losers', label: 'Losers Bracket', rounds: data.loserRounds });
  }

  const nextOf = winnerTargets(data);
  const feeders = new Map<string, string[]>();
  for (const [from, to] of nextOf) feeders.set(to, [...(feeders.get(to) ?? []), from]);

  let top = 0;
  let columns = 0;
  const sectionTop = new Map<BracketSectionKey, number>();
  const finalY = new Map<BracketSectionKey, number>();

  for (const section of sections) {
    const hasLabel = section.label !== null;
    const bodyTop = top + BRACKET_HEADER_HEIGHT + (hasLabel ? 22 : 0);
    sectionTop.set(section.key, bodyTop);
    if (section.label) sectionLabels.push({ key: section.key, label: section.label, y: top });

    const positions = placeSection(section.rounds, feeders);
    let bottom = bodyTop;
    section.rounds.forEach((round, columnIndex) => {
      const x = columnIndex * PITCH_X;
      headers.push({
        key: `${section.key}-${round.number}`,
        label: round.label,
        x,
        y: bodyTop - BRACKET_HEADER_HEIGHT,
      });
      for (const match of round.matches) {
        const y = bodyTop + (positions.get(String(match.id)) ?? 0);
        nodes.push({ id: String(match.id), section: section.key, x, y, match });
        bottom = Math.max(bottom, y + BRACKET_CARD_HEIGHT);
      }
    });
    columns = Math.max(columns, section.rounds.length);

    const last = section.rounds.at(-1)?.matches.at(-1);
    if (last) finalY.set(section.key, bodyTop + (positions.get(String(last.id)) ?? 0));
    top = bottom + BRACKET_SECTION_GAP;
  }

  // Grand final: level with the two finals that lead into it.
  const grand = data.grandFinal?.matches ?? [];
  if (grand.length > 0) {
    const ys = [...finalY.values()];
    const centre = ys.length > 0 ? mean(ys) : (sectionTop.get('winners') ?? 0);
    const x = columns * PITCH_X;
    headers.push({
      key: 'grand-final',
      label: data.grandFinal?.label ?? 'Grand Final',
      x,
      y: centre - BRACKET_HEADER_HEIGHT,
    });
    grand.forEach((match, index) => {
      nodes.push({
        id: String(match.id),
        section: 'grand-final',
        x: x + index * PITCH_X,
        y: centre,
        match,
      });
      if (index > 0) {
        headers.push({
          key: `grand-final-${index}`,
          label: 'Reset',
          x: x + index * PITCH_X,
          y: centre - BRACKET_HEADER_HEIGHT,
        });
      }
    });
  }

  // Lines run from a match to the one its winner plays next.
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: BracketEdge[] = [];
  for (const node of nodes) {
    const target = byId.get(nextOf.get(node.id) ?? '');
    if (!target) continue;
    const x1 = node.x + BRACKET_CARD_WIDTH;
    const y1 = node.y + BRACKET_CARD_HEIGHT / 2;
    const x2 = target.x;
    const y2 = target.y + BRACKET_CARD_HEIGHT / 2;
    edges.push({
      key: `${node.id}->${target.id}`,
      from: node.id,
      to: target.id,
      d: elbow(x1, y1, x2, y2),
    });
  }

  const width = Math.max(0, ...nodes.map((node) => node.x + BRACKET_CARD_WIDTH));
  const height = Math.max(0, ...nodes.map((node) => node.y + BRACKET_CARD_HEIGHT));
  return { width, height, nodes, edges, headers, sectionLabels };
}
