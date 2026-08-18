import { describe, expect, it } from 'vitest';
import {
  FORMAT_1V1,
  FORMAT_2V2,
  FORMAT_BBALL,
  FORMAT_ULTIDUO,
  formatLabel,
  formatLeagueTitle,
  isTeamFormatId,
  parseFormatCode,
  parseTeamFormatCode,
} from './formats';

describe('format helpers', () => {
  it('treats 2v2, ultiduo, and bball as team formats', () => {
    expect(isTeamFormatId(FORMAT_1V1)).toBe(false);
    expect(isTeamFormatId(FORMAT_2V2)).toBe(true);
    expect(isTeamFormatId(FORMAT_ULTIDUO)).toBe(true);
    expect(isTeamFormatId(FORMAT_BBALL)).toBe(true);
  });

  it('parses team format codes and rejects 1v1 / unknown', () => {
    expect(parseTeamFormatCode('ultiduo')?.id).toBe(FORMAT_ULTIDUO);
    expect(parseTeamFormatCode('BBALL')?.label).toBe('BBall');
    expect(parseTeamFormatCode('2v2')?.id).toBe(FORMAT_2V2);
    expect(parseTeamFormatCode('1v1')).toBeNull();
    expect(parseTeamFormatCode('highlander')).toBeNull();
    expect(parseFormatCode('bball')).toBe('bball');
  });

  it('labels league pages', () => {
    expect(formatLabel('ultiduo')).toBe('Ultiduo');
    expect(formatLeagueTitle('2v2')).toBe('2v2 MGE League');
    expect(formatLeagueTitle('bball')).toBe('BBall League');
  });
});
