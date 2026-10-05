import { describe, expect, it } from 'vitest';
import { parseLogsTfTotal } from './logsTf';

describe('parseLogsTfTotal', () => {
  it('prefers the search total over the page size', () => {
    expect(parseLogsTfTotal({ results: 1, total: 3412, logs: [{}] })).toBe(3412);
  });

  it('falls back to results when total is absent', () => {
    expect(parseLogsTfTotal({ results: 80 })).toBe(80);
  });

  it('returns null for an empty payload', () => {
    expect(parseLogsTfTotal(null)).toBeNull();
    expect(parseLogsTfTotal({})).toBeNull();
  });
});
