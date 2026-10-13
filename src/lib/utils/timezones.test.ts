import { describe, expect, it } from 'vitest';
import { standardTimezoneOptions } from './timezones';

describe('standardTimezoneOptions', () => {
  it('starts with UTC and then lists every runtime IANA timezone once', () => {
    const options = standardTimezoneOptions();
    const supported = Intl.supportedValuesOf('timeZone')
      .filter((zone) => zone !== 'UTC')
      .sort((a, b) => a.localeCompare(b, 'en'));

    expect(options.map((option) => option.value)).toEqual(['UTC', ...supported]);
    expect(options.every((option) => option.value === option.label)).toBe(true);
    expect(options.length).toBeGreaterThan(100);
  });
});
