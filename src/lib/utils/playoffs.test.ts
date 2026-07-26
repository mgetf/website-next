import { describe, expect, it } from 'vitest';
import { formatPlayoffRound } from './playoffs';

describe('formatPlayoffRound', () => {
  it('labels positive rounds as upper bracket', () => {
    expect(formatPlayoffRound(1)).toBe('Upper Round 1');
    expect(formatPlayoffRound(0)).toBe('Upper Round 0');
  });

  it('labels negative rounds as lower bracket using absolute value', () => {
    expect(formatPlayoffRound(-1)).toBe('Lower Round 1');
    expect(formatPlayoffRound(-3)).toBe('Lower Round 3');
  });
});
