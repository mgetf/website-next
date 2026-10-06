import { describe, expect, it } from 'vitest';
import { hasMetMinRosterSize } from './rosterSize';

describe('hasMetMinRosterSize', () => {
  it('blocks a solo Ulti Duo or B-Ball roster', () => {
    expect(hasMetMinRosterSize(1, 2)).toBe(false);
    expect(hasMetMinRosterSize(0, 2)).toBe(false);
  });

  it('allows a roster that meets the format minimum', () => {
    expect(hasMetMinRosterSize(2, 2)).toBe(true);
    expect(hasMetMinRosterSize(3, 2)).toBe(true);
  });

  it('allows a 1v1 entry with its single player', () => {
    expect(hasMetMinRosterSize(1, 1)).toBe(true);
  });

  it('rejects an invalid minimum', () => {
    expect(hasMetMinRosterSize(2, 0)).toBe(false);
  });
});
