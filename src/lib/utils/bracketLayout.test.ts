import { describe, expect, it } from 'vitest';
import type { BracketMatch, BracketRound, EliminationBracketData } from '#lib/types/bracket.js';
import { BRACKET_CARD_HEIGHT, BRACKET_ROW_GAP, layoutEliminationBracket } from './bracketLayout';

const PITCH = BRACKET_CARD_HEIGHT + BRACKET_ROW_GAP;

function match(id: string, round: number, position: number, next?: string): BracketMatch {
  return {
    id,
    round,
    position,
    side1: { label: `${id}a` },
    side2: { label: `${id}b` },
    status: 'upcoming',
    isBye: false,
    winnerNextMatchId: next,
  };
}

function round(number: number, matches: BracketMatch[]): BracketRound {
  return { number, label: `R${number}`, matches };
}

function single8(): EliminationBracketData {
  return {
    format: 'single_elim',
    status: 'upcoming',
    rounds: [
      round(1, [
        match('a', 1, 1, 'e'),
        match('b', 1, 2, 'e'),
        match('c', 1, 3, 'f'),
        match('d', 1, 4, 'f'),
      ]),
      round(2, [match('e', 2, 1, 'g'), match('f', 2, 2, 'g')]),
      round(3, [match('g', 3, 1)]),
    ],
  };
}

const at = (layout: ReturnType<typeof layoutEliminationBracket>, id: string) =>
  layout.nodes.find((node) => node.id === id)!;

describe('layoutEliminationBracket', () => {
  it('puts a match level with the middle of the two matches that feed it', () => {
    const layout = layoutEliminationBracket(single8());
    expect(at(layout, 'e').y).toBe((at(layout, 'a').y + at(layout, 'b').y) / 2);
    expect(at(layout, 'g').y).toBe((at(layout, 'e').y + at(layout, 'f').y) / 2);
  });

  it('gives each round its own column, left to right', () => {
    const layout = layoutEliminationBracket(single8());
    expect(at(layout, 'a').x).toBe(0);
    expect(at(layout, 'e').x).toBeGreaterThan(at(layout, 'a').x);
    expect(at(layout, 'g').x).toBeGreaterThan(at(layout, 'e').x);
  });

  it('never overlaps two matches in a column', () => {
    const layout = layoutEliminationBracket(single8());
    const column = layout.nodes
      .filter((node) => node.x === 0)
      .map((node) => node.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < column.length; i++)
      expect(column[i] - column[i - 1]).toBeGreaterThanOrEqual(PITCH);
  });

  it('draws one line per winner arrow', () => {
    expect(
      layoutEliminationBracket(single8())
        .edges.map((edge) => edge.key)
        .sort(),
    ).toEqual(['a->e', 'b->e', 'c->f', 'd->f', 'e->g', 'f->g']);
  });

  it('keeps a lone feeder straight, as when the other side had a bye', () => {
    const data: EliminationBracketData = {
      format: 'single_elim',
      status: 'upcoming',
      rounds: [
        round(1, [match('a', 1, 1, 'c'), match('b', 1, 2, 'd')]),
        round(2, [match('c', 2, 1, 'e'), match('d', 2, 2, 'e')]),
        round(3, [match('e', 3, 1)]),
      ],
    };
    const layout = layoutEliminationBracket(data);
    expect(at(layout, 'c').y).toBe(at(layout, 'a').y);
    expect(at(layout, 'd').y).toBe(at(layout, 'b').y);
  });

  it('is empty for an empty bracket', () => {
    const layout = layoutEliminationBracket({
      format: 'single_elim',
      status: 'upcoming',
      rounds: [],
    });
    expect(layout).toMatchObject({ width: 0, height: 0, nodes: [], edges: [] });
  });

  it('stacks the losers bracket under winners and centres the grand final between the finals', () => {
    const data: EliminationBracketData = {
      format: 'double_elim',
      status: 'upcoming',
      rounds: [
        round(1, [match('w1', 1, 1, 'w2'), match('w1b', 1, 2, 'w2')]),
        round(2, [match('w2', 2, 1, 'gf')]),
      ],
      loserRounds: [round(1, [match('l1', 1, 1, 'l2')]), round(2, [match('l2', 2, 1, 'gf')])],
      grandFinal: {
        number: 0,
        label: 'Grand Final',
        matches: [match('gf', 0, 1), match('gf2', 0, 2)],
      },
    };
    const layout = layoutEliminationBracket(data);
    expect(at(layout, 'l1').y).toBeGreaterThan(at(layout, 'w1b').y);
    expect(at(layout, 'gf').y).toBe((at(layout, 'w2').y + at(layout, 'l2').y) / 2);
    expect(at(layout, 'gf').x).toBeGreaterThan(at(layout, 'w2').x);
    expect(at(layout, 'gf2').x).toBeGreaterThan(at(layout, 'gf').x);
    expect(layout.edges.some((edge) => edge.key === 'gf->gf2')).toBe(true);
    expect(layout.sectionLabels.map((label) => label.label)).toEqual([
      'Winners Bracket',
      'Losers Bracket',
    ]);
  });
});
