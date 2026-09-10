import { describe, expect, it } from 'vitest';
import type { MatchComm } from '$prisma/client.js';
import { UserRole } from '$prisma/client.js';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';
import { canRespondToReschedule } from './matchComms';

function comm(owner: string): MatchComm {
  return { owner } as MatchComm;
}

function user(steamId: string, permissionLevel: UserRole = UserRole.GUEST) {
  return { steamId, permissionLevel };
}

const match2v2 = {
  homeTeam: {
    formatId: FORMAT_2V2,
    players: [
      { playerSteamId: 'home-owner', permissionLevel: 2, active: 1 },
      { playerSteamId: 'home-admin', permissionLevel: 1, active: 1 },
      { playerSteamId: 'home-member', permissionLevel: 0, active: 1 },
      { playerSteamId: 'home-inactive-admin', permissionLevel: 1, active: 0 },
    ],
  },
  awayTeam: {
    formatId: FORMAT_2V2,
    players: [
      { playerSteamId: 'away-owner', permissionLevel: 2, active: 1 },
      { playerSteamId: 'away-admin', permissionLevel: 1, active: 1 },
    ],
  },
} as Parameters<typeof canRespondToReschedule>[2];

describe('canRespondToReschedule', () => {
  const awayRequest = comm('away-owner');

  it('lets the opposing team admin accept or deny', () => {
    expect(canRespondToReschedule(user('home-admin'), awayRequest, match2v2, 'accept')).toBe(true);
    expect(canRespondToReschedule(user('home-admin'), awayRequest, match2v2, 'deny')).toBe(true);
  });

  it('lets the opposing team owner accept', () => {
    expect(canRespondToReschedule(user('home-owner'), awayRequest, match2v2, 'accept')).toBe(true);
  });

  it('denies regular members and inactive admins', () => {
    expect(canRespondToReschedule(user('home-member'), awayRequest, match2v2, 'accept')).toBe(
      false,
    );
    expect(
      canRespondToReschedule(user('home-inactive-admin'), awayRequest, match2v2, 'accept'),
    ).toBe(false);
  });

  it('does not let the requester accept their own request', () => {
    expect(canRespondToReschedule(user('away-owner'), awayRequest, match2v2, 'accept')).toBe(false);
  });

  it('lets the requester cancel', () => {
    expect(canRespondToReschedule(user('away-owner'), awayRequest, match2v2, 'cancel')).toBe(true);
  });

  it('does not let a teammate cancel someone else request', () => {
    expect(canRespondToReschedule(user('away-admin'), awayRequest, match2v2, 'cancel')).toBe(false);
  });

  it('lets site staff accept or cancel any request', () => {
    expect(
      canRespondToReschedule(user('staff', UserRole.ADMIN), awayRequest, match2v2, 'accept'),
    ).toBe(true);
    expect(
      canRespondToReschedule(user('staff', UserRole.MODERATOR), awayRequest, match2v2, 'cancel'),
    ).toBe(true);
  });

  it('denies anonymous users', () => {
    expect(canRespondToReschedule(null, awayRequest, match2v2, 'accept')).toBe(false);
  });

  it('treats a 1v1 sole member as manager even with a stale permission', () => {
    const soloMatch = {
      homeTeam: {
        formatId: FORMAT_1V1,
        players: [{ playerSteamId: 'home-1v1', permissionLevel: 0, active: 1 }],
      },
      awayTeam: {
        formatId: FORMAT_1V1,
        players: [{ playerSteamId: 'away-1v1', permissionLevel: 0, active: 1 }],
      },
    } as Parameters<typeof canRespondToReschedule>[2];

    expect(canRespondToReschedule(user('home-1v1'), comm('away-1v1'), soloMatch, 'accept')).toBe(
      true,
    );
  });
});
