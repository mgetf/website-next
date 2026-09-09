import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import { parseDivisionScopeTokens } from './divisions';

describe('parseDivisionScopeTokens', () => {
  it('parses regionId:formatId tokens and skips blanks', () => {
    expect(parseDivisionScopeTokens([`4:${FORMAT_2V2}`, '', `3:${FORMAT_1V1}`])).toEqual([
      { regionId: 4, formatId: FORMAT_2V2 },
      { regionId: 3, formatId: FORMAT_1V1 },
    ]);
  });

  it('dedupes the same region and format pair', () => {
    expect(parseDivisionScopeTokens([`4:${FORMAT_2V2}`, `4:${FORMAT_2V2}`])).toEqual([
      { regionId: 4, formatId: FORMAT_2V2 },
    ]);
  });

  it('rejects malformed tokens', () => {
    expect(() => parseDivisionScopeTokens([`1:${FORMAT_2V2}`, 'nope'])).toThrow(
      'Invalid region/format scope',
    );
  });
});
