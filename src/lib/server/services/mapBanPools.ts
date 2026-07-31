/**
 * Map Ban Pool Service
 *
 * All map ban pool-related business logic and database operations.
 */

import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  createMapPoolsClient,
  getArena,
  getPool,
  getPoolIds,
  getPoolMaps,
} from '$lib/server/rama/mapPools';

/**
 * Get all map ban pools with their maps and match counts
 */
export type MapBanPoolRow = {
  id: number;
  name: string;
  isActive: number | boolean;
  createdAt: Date;
  mapsInPool: Array<{
    poolId: number;
    arenaId: number;
    orderNum: number;
    arena: { id: number; name: string; avatar: string | null; playoffMap: number };
  }>;
  _count: { matchMapBans: number };
};

export async function getMapBanPools(): Promise<MapBanPoolRow[]> {
  if (isRamaBackend()) {
    const client = createMapPoolsClient(ramaClientOpts());
    const ids = await getPoolIds(client);
    const rows = [];
    for (const poolId of ids) {
      const pool = await getPool(client, poolId);
      if (!pool) continue;
      const arenaIds = await getPoolMaps(client, poolId);
      const mapsInPool = [];
      for (let i = 0; i < arenaIds.length; i++) {
        const arenaId = arenaIds[i]!;
        const arena = await getArena(client, arenaId);
        mapsInPool.push({
          poolId: Number(poolId),
          arenaId: Number(arenaId),
          orderNum: i + 1,
          arena: {
            id: Number(arenaId),
            name: arena?.name ?? String(arenaId),
            avatar: arena?.avatar || null,
            playoffMap: Number(arena?.playoffMap ?? 0),
          },
        });
      }
      rows.push({
        id: Number(poolId),
        name: pool.name,
        isActive: pool.isActive ? 1 : 0,
        createdAt: new Date(0),
        mapsInPool,
        _count: { matchMapBans: 0 },
      });
    }
    return rows;
  }

  return [];
}

/**
 * Create a new map ban pool
 */
export async function createMapBanPool(
  name: string,
): Promise<{ id: number; name: string; isActive: boolean }> {
  throw new Error('createMapBanPool is not available under Rama');
}

/**
 * Update an existing map ban pool
 *
 * Business logic validation:
 * - Pool must exist
 */
export async function updateMapBanPool(id: number, name: string) {
  throw new Error('updateMapBanPool is not available under Rama');
}

/**
 * Toggle map ban pool active status
 *
 * Business logic validation:
 * - Pool must exist
 */
export async function toggleMapBanPoolStatus(
  id: number,
): Promise<{ id: number; name: string; isActive: boolean }> {
  throw new Error('toggleMapBanPoolStatus is not available under Rama');
}

/**
 * Add maps to a pool
 *
 * Business logic validation:
 * - Pool must exist
 * - Skips arenas that are already in the pool
 */
export async function addMapsToPool(poolId: number, arenaIds: number[]) {
  throw new Error('addMapsToPool is not available under Rama');
}

/**
 * Remove a map from a pool
 */
export async function removeMapFromPool(poolId: number, arenaId: number) {
  throw new Error('removeMapFromPool is not available under Rama');
}

/**
 * Delete a map ban pool
 *
 * Business logic validation:
 * - Pool must exist
 * - Pool must not be used by any matches
 * - Deletes all associated maps in pool first
 */
export async function deleteMapBanPool(id: number) {
  throw new Error('deleteMapBanPool is not available under Rama');
}
