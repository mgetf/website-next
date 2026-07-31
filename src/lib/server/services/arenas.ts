/**
 * Arena Service
 *
 * All arena-related business logic and database operations.
 */

import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createMapPoolsClient, getArena, getArenaIds } from '$lib/server/rama/mapPools';

/**
 * Get all arenas with their game counts
 */
export async function getArenas() {
  if (isRamaBackend()) {
    const client = createMapPoolsClient(ramaClientOpts());
    const ids = await getArenaIds(client);
    const rows = [];
    for (const id of ids) {
      const arena = await getArena(client, id);
      if (!arena) continue;
      rows.push({
        id: Number(id),
        name: arena.name,
        avatar: arena.avatar || null,
        playoffMap: Number(arena.playoffMap ?? 0),
        _count: { games: 0 },
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }
  throw new Error('getArenas requires DATA_BACKEND=rama');
}

/**
 * Create a new arena
 *
 * Business logic validation:
 * - Arena name must be unique (case-insensitive)
 */
export async function createArena(data: {
  name: string;
  avatar?: string | null;
  playoffMap: number;
}) {
  throw new Error('createArena is not available under Rama');
}

/**
 * Update an existing arena
 *
 * Business logic validation:
 * - Arena must exist
 * - New name must not conflict with another arena (case-insensitive)
 */
export async function updateArena(
  id: number,
  data: {
    name: string;
    avatar?: string | null;
    playoffMap: number;
  },
) {
  throw new Error('updateArena is not available under Rama');
}

/**
 * Delete an arena
 *
 * Business logic validation:
 * - Arena must exist
 * - Arena must not have any games played on it
 */
export async function deleteArena(id: number) {
  throw new Error('deleteArena is not available under Rama');
}
