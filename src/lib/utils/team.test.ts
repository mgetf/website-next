import { describe, expect, it } from 'vitest';
import { isTeamRoleLevel, parseTeamTab, teamRoleName } from './team.js';

describe('parseTeamTab', () => {
  it('keeps overview unless the viewer can open the requested tab', () => {
    expect(parseTeamTab(null, false)).toBe('overview');
    expect(parseTeamTab('management', false)).toBe('overview');
    expect(parseTeamTab('admin', true)).toBe('overview');
    expect(parseTeamTab('management', true)).toBe('management');
    expect(parseTeamTab('admin', false, true)).toBe('admin');
  });
});

describe('team roles', () => {
  it('names leader, co-leader, and member', () => {
    expect(teamRoleName(2)).toBe('Leader');
    expect(teamRoleName(1)).toBe('Co-leader');
    expect(teamRoleName(0)).toBe('Member');
  });

  it('accepts only the three assignable roles', () => {
    expect(isTeamRoleLevel(0)).toBe(true);
    expect(isTeamRoleLevel(1)).toBe(true);
    expect(isTeamRoleLevel(2)).toBe(true);
    expect(isTeamRoleLevel(-2)).toBe(false);
    expect(isTeamRoleLevel(3)).toBe(false);
  });
});
