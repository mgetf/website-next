/**
 * Typed helpers for MapPoolsModule over Rama REST JSON.
 *
 * @lintignore Spike map-pool helpers; production admin pools still use Postgres.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';

export const MAP_POOLS_MODULE = 'mge.tf.rama.map-pools-module/MapPoolsModule';
export const MAP_POOL_DEPOT = '*map-pool-depot';

export type MapPoolAck = {
  ok: boolean;
  error?: string;
  arenaId?: string;
  poolId?: string;
  isActive?: boolean;
  type?: string;
};

function asAck(topologyReturns: Record<string, unknown>): MapPoolAck {
  const raw = topologyReturns['map-pools'];
  if (raw && typeof raw === 'object') return raw as MapPoolAck;
  return { ok: false, error: 'missing-ack' };
}

function withLongs(event: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out = { ...event };
  for (const k of keys) {
    if (typeof out[k] === 'number') out[k] = ramaLong(out[k] as number);
  }
  return out;
}

export function createMapPoolsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: MAP_POOLS_MODULE,
  });
}

export async function upsertArena(
  client: RamaClient,
  event: {
    arenaId: string;
    name: string;
    avatar?: string;
    playoffMap?: number;
  },
  ackLevel: AckLevel = 'ack',
): Promise<MapPoolAck> {
  return asAck(
    await client.append(
      MAP_POOL_DEPOT,
      withLongs(
        {
          type: 'upsert-arena',
          arenaId: event.arenaId,
          name: event.name,
          avatar: event.avatar ?? '',
          playoffMap: event.playoffMap ?? 0,
        },
        ['playoffMap'],
      ),
      ackLevel,
    ),
  );
}

export async function createPool(
  client: RamaClient,
  event: { poolId: string; name: string },
  ackLevel: AckLevel = 'ack',
): Promise<MapPoolAck> {
  return asAck(await client.append(MAP_POOL_DEPOT, { type: 'create-pool', ...event }, ackLevel));
}

export async function renamePool(
  client: RamaClient,
  event: { poolId: string; name: string },
  ackLevel: AckLevel = 'ack',
): Promise<MapPoolAck> {
  return asAck(await client.append(MAP_POOL_DEPOT, { type: 'rename-pool', ...event }, ackLevel));
}

export async function setPoolActive(
  client: RamaClient,
  event: { poolId: string; isActive: boolean },
  ackLevel: AckLevel = 'ack',
): Promise<MapPoolAck> {
  return asAck(
    await client.append(MAP_POOL_DEPOT, { type: 'set-pool-active', ...event }, ackLevel),
  );
}

export async function setPoolMaps(
  client: RamaClient,
  event: { poolId: string; arenaIds: string[] },
  ackLevel: AckLevel = 'ack',
): Promise<MapPoolAck> {
  return asAck(await client.append(MAP_POOL_DEPOT, { type: 'set-pool-maps', ...event }, ackLevel));
}

export async function getArenaName(client: RamaClient, arenaId: string): Promise<string | null> {
  try {
    return (await client.selectOne('$$arenas', [arenaId, 'name'])) as string;
  } catch {
    return null;
  }
}

export async function getPool(
  client: RamaClient,
  poolId: string,
): Promise<{
  name: string;
  isActive: boolean;
} | null> {
  try {
    const v = await client.selectOne('$$pools', [poolId]);
    if (!v || typeof v !== 'object') return null;
    return v as { name: string; isActive: boolean };
  } catch {
    return null;
  }
}

export async function getPoolMaps(client: RamaClient, poolId: string): Promise<string[]> {
  try {
    const v = await client.selectOne('$$pool-maps', [poolId]);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export async function getArena(
  client: RamaClient,
  arenaId: string,
): Promise<{ name: string; avatar: string; playoffMap: number } | null> {
  try {
    const v = await client.selectOne('$$arenas', [arenaId]);
    if (!v || typeof v !== 'object') return null;
    return v as { name: string; avatar: string; playoffMap: number };
  } catch {
    return null;
  }
}

export async function getArenaIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$arena-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getPoolIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$pool-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}
