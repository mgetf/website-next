import { getPlayerServerStats as fetchPlatformServerStats } from '$lib/server/clients/mgePlatform';
import { getUserDisplaysByIds } from '$lib/server/services/users';
import type { PlayerFoe, PlayerServerStats, StatsWindow } from '$lib/types/profile';

const DEFAULT_AVATAR = '/default-avatar.png';

function avatarFor(
  steam64: string | null,
  displays: Record<string, { avatar: string | null }>,
): string {
  if (!steam64) return DEFAULT_AVATAR;
  return displays[steam64]?.avatar || DEFAULT_AVATAR;
}

function withFoeAvatar(
  foe: Omit<PlayerFoe, 'avatar'> | PlayerFoe | null,
  displays: Record<string, { avatar: string | null }>,
): PlayerFoe | null {
  if (!foe) return null;
  return { ...foe, avatar: avatarFor(foe.steam64, displays) };
}

export async function getEnrichedPlayerServerStats(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
): Promise<PlayerServerStats | null> {
  const stats = await fetchPlatformServerStats(steamId, opts);
  if (!stats) return null;

  const steam64s = new Set<string>();
  const collect = (id: string | null | undefined) => {
    if (id) steam64s.add(id);
  };
  for (const foe of stats.foes) collect(foe.steam64);
  collect(stats.rivals.nemesis?.steam64);
  collect(stats.rivals.dominated?.steam64);
  collect(stats.rivals.frequent?.steam64);
  for (const duel of stats.recentDuels) collect(duel.opponentSteam64);
  for (const row of stats.recentDoubles) {
    collect(row.partnerSteam64);
    for (const opponent of row.opponents) collect(opponent.steam64);
  }

  const displays = await getUserDisplaysByIds([...steam64s]);

  return {
    ...stats,
    foes: stats.foes.map((foe) => withFoeAvatar(foe, displays)!),
    rivals: {
      nemesis: withFoeAvatar(stats.rivals.nemesis, displays),
      dominated: withFoeAvatar(stats.rivals.dominated, displays),
      frequent: withFoeAvatar(stats.rivals.frequent, displays),
    },
    recentDuels: stats.recentDuels.map((duel) => ({
      ...duel,
      opponentAvatar: avatarFor(duel.opponentSteam64, displays),
    })),
    recentDoubles: stats.recentDoubles.map((row) => ({
      ...row,
      partnerAvatar: avatarFor(row.partnerSteam64, displays),
      opponents: row.opponents.map((opponent) => ({
        ...opponent,
        avatar: avatarFor(opponent.steam64, displays),
      })),
    })),
  };
}
