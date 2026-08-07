import { describe, expect, it } from 'vitest';
import { BanStatus, UserRole, type SessionUser } from '$lib/types/user';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';
import { calculateMatchWinner, canUserManageMatch, validateScoreSubmission } from './matchScoring';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    steamId: '76561198000000001',
    steamUsername: 'player',
    steamAvatar: '',
    permissionLevel: UserRole.GUEST,
    banStatus: BanStatus.NONE,
    ...overrides,
  };
}

describe('validateScoreSubmission', () => {
  it('accepts non-negative integers', () => {
    expect(validateScoreSubmission({ g1: 0, g2: 8 }, 3)).toEqual({ valid: true });
  });

  it('rejects negatives and non-integers', () => {
    expect(validateScoreSubmission({ g1: -1 }, 3)).toEqual({
      valid: false,
      error: 'Invalid score value',
    });
    expect(validateScoreSubmission({ g1: 1.5 }, 3)).toEqual({
      valid: false,
      error: 'Invalid score value',
    });
  });
});

describe('calculateMatchWinner', () => {
  it('tallies regular-season game wins', () => {
    const result = calculateMatchWinner(
      1,
      2,
      [
        { gameNum: 1, homeScore: 8, awayScore: 2 },
        { gameNum: 2, homeScore: 1, awayScore: 8 },
        { gameNum: 3, homeScore: 8, awayScore: 0 },
      ],
      null,
    );

    expect(result).toEqual({
      winnerId: 1,
      winnerScore: 2,
      loserScore: 1,
      homePointsScored: 17,
      awayPointsScored: 10,
    });
  });

  it('returns a draw when units are equal', () => {
    const result = calculateMatchWinner(
      1,
      2,
      [
        { gameNum: 1, homeScore: 8, awayScore: 0 },
        { gameNum: 2, homeScore: 0, awayScore: 8 },
      ],
      1,
    );

    expect(result.winnerId).toBeNull();
    expect(result.winnerScore).toBe(0);
    expect(result.loserScore).toBe(0);
  });

  it('tallies arena wins for playoff series with boGames > 1', () => {
    // gamesPerArena = 2 → arena0 = games 1-2, arena1 = games 3-4
    const result = calculateMatchWinner(
      10,
      20,
      [
        { gameNum: 1, homeScore: 8, awayScore: 1 },
        { gameNum: 2, homeScore: 8, awayScore: 2 },
        { gameNum: 3, homeScore: 1, awayScore: 8 },
        { gameNum: 4, homeScore: 0, awayScore: 8 },
      ],
      2,
    );

    expect(result).toEqual({
      winnerId: null,
      winnerScore: 0,
      loserScore: 0,
      homePointsScored: 17,
      awayPointsScored: 19,
    });
  });

  it('awards the playoff series when one side wins more arenas', () => {
    const result = calculateMatchWinner(
      10,
      20,
      [
        { gameNum: 1, homeScore: 8, awayScore: 0 },
        { gameNum: 2, homeScore: 8, awayScore: 0 },
        { gameNum: 3, homeScore: 8, awayScore: 1 },
        { gameNum: 4, homeScore: 0, awayScore: 8 },
      ],
      2,
    );

    // Arena 0 (games 1-2) home; arena 1 (games 3-4) drawn → home leads 1-0 arenas
    expect(result.winnerId).toBe(10);
    expect(result.winnerScore).toBe(1);
    expect(result.loserScore).toBe(0);
  });
});

describe('canUserManageMatch', () => {
  const baseMatch = {
    homeTeam: {
      formatId: FORMAT_2V2,
      players: [
        { playerSteamId: '76561198000000001', permissionLevel: 2, active: 1 },
        { playerSteamId: '76561198000000002', permissionLevel: 0, active: 1 },
      ],
    },
    awayTeam: {
      formatId: FORMAT_2V2,
      players: [{ playerSteamId: '76561198000000003', permissionLevel: 2, active: 1 }],
    },
  };

  it('denies anonymous users', () => {
    expect(canUserManageMatch(null, baseMatch).canManage).toBe(false);
  });

  it('allows team owners and admins', () => {
    expect(canUserManageMatch(user(), baseMatch)).toMatchObject({
      canManage: true,
      isHomeOwner: true,
      isAwayOwner: false,
      isAdmin: false,
    });

    expect(
      canUserManageMatch(
        user({ steamId: '76561198000000099', permissionLevel: UserRole.ADMIN }),
        baseMatch,
      ),
    ).toMatchObject({ canManage: true, isAdmin: true });
  });

  it('denies inactive or non-owner 2v2 members', () => {
    expect(canUserManageMatch(user({ steamId: '76561198000000002' }), baseMatch).canManage).toBe(
      false,
    );
  });

  it('treats the sole active 1v1 member as owner regardless of permission level', () => {
    const solo = {
      homeTeam: {
        formatId: FORMAT_1V1,
        players: [{ playerSteamId: '76561198000000001', permissionLevel: 0, active: 1 }],
      },
      awayTeam: {
        formatId: FORMAT_1V1,
        players: [{ playerSteamId: '76561198000000009', permissionLevel: 0, active: 1 }],
      },
    };

    expect(canUserManageMatch(user(), solo)).toMatchObject({
      canManage: true,
      isHomeOwner: true,
    });
  });
});
