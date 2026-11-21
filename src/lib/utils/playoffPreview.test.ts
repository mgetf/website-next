import { describe, expect, it } from 'vitest';
import { playoffPreviewBracket } from './playoffPreview';

const teams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `Team ${i + 1}` }));

describe('playoffPreviewBracket', () => {
  it('needs two teams', () => {
    expect(playoffPreviewBracket('SINGLE_ELIM', teams(1))).toBeNull();
  });

  it('pairs seed 1 with the last seed in round one', () => {
    const bracket = playoffPreviewBracket('SINGLE_ELIM', teams(8))!;
    const first = bracket.rounds[0].matches[0];
    expect(first.side1).toMatchObject({ label: 'Team 1', seed: 1 });
    expect(first.side2).toMatchObject({ label: 'Team 8', seed: 8 });
    expect(bracket.rounds.map((round) => round.label)).toEqual([
      'Quarterfinals',
      'Semifinals',
      'Final',
    ]);
  });

  it('follows the order given, so moving a team changes its matchup', () => {
    const order = teams(4);
    const swapped = [order[1], order[0], order[2], order[3]];
    const first = playoffPreviewBracket('SINGLE_ELIM', swapped)!.rounds[0].matches[0];
    expect(first.side1).toMatchObject({ label: 'Team 2', seed: 1 });
  });

  it('shows a bye for the top seeds of an uneven field', () => {
    const bracket = playoffPreviewBracket('SINGLE_ELIM', teams(6))!;
    const byes = bracket.rounds[0].matches.filter((match) => match.isBye);
    expect(byes.length).toBe(2);
    expect(byes.every((match) => match.side2.label === 'BYE')).toBe(true);
  });

  it('keeps winner arrows so the renderer can draw lines', () => {
    const bracket = playoffPreviewBracket('SINGLE_ELIM', teams(4))!;
    expect(bracket.rounds[0].matches.every((match) => match.winnerNextMatchId !== undefined)).toBe(
      true,
    );
  });

  it('builds winners, losers and a grand final for double elimination', () => {
    const bracket = playoffPreviewBracket('DOUBLE_ELIM', teams(8))!;
    expect(bracket.format).toBe('double_elim');
    if (bracket.format !== 'double_elim') return;
    expect(bracket.rounds.length).toBe(3);
    expect(bracket.loserRounds?.length).toBe(4);
    expect(bracket.grandFinal?.matches.length).toBe(1);
  });
});
