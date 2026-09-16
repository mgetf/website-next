import { describe, expect, it } from 'vitest';
import { generateJoinToken, validateJoinToken } from '$lib/server/services/teamSignup';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  createTeamInviteToken,
  parseTeamInviteToken,
  TEAM_INVITE_TTL_SECONDS,
} from '$lib/server/utils/teamInviteToken';

function messageOf(fn: () => void): string {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    return getErrorMessage(err);
  }
}

describe('createTeamInviteToken / parseTeamInviteToken', () => {
  it('round-trips a team id into a compact token', () => {
    const token = createTeamInviteToken(18);
    expect(token.includes('.')).toBe(false);
    expect(token.length).toBeLessThanOrEqual(34);
    expect(parseTeamInviteToken(token)).toEqual({ ok: true, teamId: 18 });
  });

  it('rejects a tampered payload', () => {
    const token = createTeamInviteToken(18);
    const bytes = Buffer.from(token, 'base64url');
    bytes[1] ^= 0xff;
    expect(parseTeamInviteToken(bytes.toString('base64url'))).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects an expired token', () => {
    const now = 1_700_000_000;
    const token = createTeamInviteToken(18, now);
    expect(parseTeamInviteToken(token, now + TEAM_INVITE_TTL_SECONDS)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('generateJoinToken / validateJoinToken', () => {
  it('issues compact tokens that validate to the same team', () => {
    const token = generateJoinToken(42);
    expect(validateJoinToken(token)).toEqual({ teamId: 42 });
  });

  it('rejects garbage and expired tokens with the existing messages', () => {
    expect(messageOf(() => validateJoinToken('not-a-token'))).toBe('Invalid invitation link');

    const now = 1_700_000_000;
    const expired = createTeamInviteToken(18, now - TEAM_INVITE_TTL_SECONDS - 1);
    expect(messageOf(() => validateJoinToken(expired))).toBe('Invitation link has expired');
  });
});
