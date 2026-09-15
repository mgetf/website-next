import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerServerStats } from '$lib/types/profile';

const { getPlayerServerStats } = vi.hoisted(() => ({
  getPlayerServerStats: vi.fn(),
}));

vi.mock('$lib/server/clients/mgePlatform', () => ({
  getPlayerServerStats,
}));

vi.mock('$lib/server/services/users', () => ({
  getUserDisplaysByIds: vi.fn(async () => ({})),
}));

import {
  getEnrichedPlayerServerStats,
  isPlayerServerStatsWarm,
  resetPlayerServerStatsCache,
} from './playerStats';

function mockStats(overrides: Partial<PlayerServerStats> = {}): PlayerServerStats {
  return {
    steamId: 'STEAM_0:1:1',
    steam64: '1',
    region: 'sa',
    days: 'all',
    timeZone: 'UTC',
    rating: { series: [], peak: null, low: null, samples: 0 },
    activity: {
      byWeekdayHour: Array.from({ length: 7 }, () => new Array(24).fill(0)),
      games: 1,
      timeZone: 'UTC',
      peakWeekday: null,
      peakHour: null,
      typicalHours: null,
      sessions: { count: 0, medianDurationMin: null, medianGames: null },
      lastSeen: null,
    },
    arenas: [],
    classes: [],
    foes: [],
    rivals: { nemesis: null, dominated: null, frequent: null },
    recentDuels: [],
    recentDoubles: [],
    ...overrides,
  };
}

const opts = { region: 'sa', days: 'all' as const, tz: 'America/Argentina/Buenos_Aires' };

describe('getEnrichedPlayerServerStats cache', () => {
  beforeEach(() => {
    resetPlayerServerStatsCache();
    getPlayerServerStats.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPlayerServerStatsCache();
  });

  it('reuses a fresh copy instead of refetching platform', async () => {
    getPlayerServerStats.mockResolvedValue(mockStats());

    const first = await getEnrichedPlayerServerStats('76561198000000001', opts);
    const second = await getEnrichedPlayerServerStats('76561198000000001', opts);

    expect(first).toEqual(second);
    expect(getPlayerServerStats).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent misses onto one platform fetch', async () => {
    let release!: (value: PlayerServerStats) => void;
    getPlayerServerStats.mockImplementation(
      () =>
        new Promise<PlayerServerStats>((resolve) => {
          release = resolve;
        }),
    );

    const pending = [
      getEnrichedPlayerServerStats('76561198000000001', opts),
      getEnrichedPlayerServerStats('76561198000000001', opts),
      getEnrichedPlayerServerStats('76561198000000001', opts),
    ];
    expect(getPlayerServerStats).toHaveBeenCalledTimes(1);

    release(mockStats());
    const results = await Promise.all(pending);
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(getPlayerServerStats).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    getPlayerServerStats
      .mockResolvedValueOnce(mockStats({ activity: { ...mockStats().activity, games: 1 } }))
      .mockResolvedValueOnce(mockStats({ activity: { ...mockStats().activity, games: 2 } }));

    const first = await getEnrichedPlayerServerStats('76561198000000001', opts);
    vi.setSystemTime(new Date('2026-01-01T00:05:01Z'));
    const second = await getEnrichedPlayerServerStats('76561198000000001', opts);

    expect(first?.activity.games).toBe(1);
    expect(second?.activity.games).toBe(2);
    expect(getPlayerServerStats).toHaveBeenCalledTimes(2);
  });

  it('treats different timezones as distinct cache keys', async () => {
    getPlayerServerStats
      .mockResolvedValueOnce(mockStats({ timeZone: 'America/Argentina/Buenos_Aires' }))
      .mockResolvedValueOnce(mockStats({ timeZone: 'Europe/Madrid' }));

    await getEnrichedPlayerServerStats('76561198000000001', opts);
    await getEnrichedPlayerServerStats('76561198000000001', {
      ...opts,
      tz: 'Europe/Madrid',
    });

    expect(getPlayerServerStats).toHaveBeenCalledTimes(2);
  });

  it('serves the last good copy when a refresh fails', async () => {
    getPlayerServerStats
      .mockResolvedValueOnce(mockStats({ activity: { ...mockStats().activity, games: 9 } }))
      .mockResolvedValueOnce(null);

    const first = await getEnrichedPlayerServerStats('76561198000000001', opts);
    vi.setSystemTime(new Date('2026-01-01T00:05:01Z'));
    const second = await getEnrichedPlayerServerStats('76561198000000001', opts);

    expect(first?.activity.games).toBe(9);
    expect(second?.activity.games).toBe(9);
    expect(getPlayerServerStats).toHaveBeenCalledTimes(2);
  });

  it('is warm for a fresh copy and for an in-flight refresh', async () => {
    let release!: (value: PlayerServerStats) => void;
    getPlayerServerStats.mockImplementation(
      () =>
        new Promise<PlayerServerStats>((resolve) => {
          release = resolve;
        }),
    );

    expect(isPlayerServerStatsWarm('76561198000000001', opts)).toBe(false);

    const pending = getEnrichedPlayerServerStats('76561198000000001', opts);
    expect(isPlayerServerStatsWarm('76561198000000001', opts)).toBe(true);

    release(mockStats());
    await pending;
    expect(isPlayerServerStatsWarm('76561198000000001', opts)).toBe(true);
  });
});
