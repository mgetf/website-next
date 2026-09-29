import { describe, expect, it } from 'vitest';
import { parseProfileTab } from './profile';

describe('parseProfileTab', () => {
  it('defaults to overview', () => {
    expect(parseProfileTab(null)).toBe('overview');
    expect(parseProfileTab('overview')).toBe('overview');
    expect(parseProfileTab('unknown')).toBe('overview');
  });

  it('accepts stats and 1v1 when allowed', () => {
    expect(parseProfileTab('stats')).toBe('stats');
    expect(parseProfileTab('1v1')).toBe('1v1');
    expect(parseProfileTab('1v1', { allow1v1: true })).toBe('1v1');
  });

  it('falls back from 1v1 when the profile is unregistered', () => {
    expect(parseProfileTab('1v1', { allow1v1: false })).toBe('overview');
    expect(parseProfileTab('stats', { allow1v1: false })).toBe('stats');
  });
});
