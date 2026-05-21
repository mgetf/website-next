import type { PageServerLoad } from './$types';
import { listMatchLogs, listMatchLogsByPlayer } from '$lib/server/services/matchLogs';
import { getUserBySteamId } from '$lib/server/services/users';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const playerSteamId = url.searchParams.get('player')?.trim() || null;

  if (playerSteamId) {
    const [{ logs, total, totalPages }, user] = await Promise.all([
      listMatchLogsByPlayer(playerSteamId, page),
      getUserBySteamId(playerSteamId),
    ]);

    return {
      logs,
      pagination: { page, totalPages, total },
      filterPlayer: {
        steamId: playerSteamId,
        name: user?.steamUsername ?? null,
      },
    };
  }

  const { logs, total, totalPages } = await listMatchLogs(page);

  return {
    logs,
    pagination: { page, totalPages, total },
    filterPlayer: null,
  };
};
