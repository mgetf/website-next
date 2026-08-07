import { describe, expect, it } from 'vitest';
import { determineNextAction, shouldSwitchTurn } from './mapBanLogic';

describe('determineNextAction', () => {
  it('follows the BO3 ban/pick sequence', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => determineNextAction(n, 3))).toEqual([
      'ban',
      'ban',
      'pick',
      'pick',
      'ban',
      'pick',
      '',
    ]);
  });

  it('follows the BO5 ban/pick sequence', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => determineNextAction(n, 5))).toEqual([
      'ban',
      'ban',
      'pick',
      'pick',
      'ban',
      'pick',
      'pick',
      'pick',
      '',
    ]);
  });

  it('follows the BO7 ban/pick sequence', () => {
    expect([...Array(11).keys()].map((n) => determineNextAction(n, 7))).toEqual([
      'ban',
      'ban',
      'pick',
      'pick',
      'ban',
      'pick',
      'pick',
      'pick',
      'pick',
      'pick',
      '',
    ]);
  });

  it('returns empty for unsupported series', () => {
    expect(determineNextAction(0, 1)).toBe('');
    expect(determineNextAction(0, 9)).toBe('');
  });
});

describe('shouldSwitchTurn', () => {
  it('follows BO3 turn switches', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => shouldSwitchTurn(n, 3))).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('follows BO5 turn switches', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => shouldSwitchTurn(n, 5))).toEqual([
      true,
      false,
      true,
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('follows BO7 turn switches', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => shouldSwitchTurn(n, 7))).toEqual([
      true,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('returns false for unsupported series', () => {
    expect(shouldSwitchTurn(0, 4)).toBe(false);
  });
});
