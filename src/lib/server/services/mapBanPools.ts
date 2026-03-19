/**
 * Map Ban Pool Service
 *
 * All map ban pool-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all map ban pools with their maps and match counts
 */
export async function getMapBanPools() {
  return await prisma.mapBanPool.findMany({
    include: {
      mapsInPool: {
        include: {
          arena: true,
        },
        orderBy: {
          orderNum: 'asc',
        },
      },
      _count: {
        select: {
          matchMapBans: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get a single map ban pool by ID
 */
export async function getMapBanPoolById(id: number) {
  return await prisma.mapBanPool.findUnique({
    where: { id },
    include: {
      mapsInPool: {
        include: {
          arena: true,
        },
        orderBy: {
          orderNum: 'asc',
        },
      },
      _count: {
        select: {
          matchMapBans: true,
        },
      },
    },
  });
}

/**
 * Create a new map ban pool
 */
export async function createMapBanPool(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error('Map ban pool name is required');
  }

  return await prisma.mapBanPool.create({
    data: { name: trimmedName, isActive: false },
  });
}

/**
 * Update an existing map ban pool
 *
 * Business logic validation:
 * - Pool must exist
 */
export async function updateMapBanPool(id: number, name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error('Pool name is required');
  }

  // Check if pool exists
  const pool = await prisma.mapBanPool.findUnique({ where: { id } });
  if (!pool) {
    throw new Error('Map ban pool not found');
  }

  return await prisma.mapBanPool.update({
    where: { id },
    data: { name: trimmedName },
  });
}

/**
 * Toggle map ban pool active status
 *
 * Business logic validation:
 * - Pool must exist
 */
export async function toggleMapBanPoolStatus(id: number) {
  const pool = await prisma.mapBanPool.findUnique({ where: { id } });

  if (!pool) {
    throw new Error('Map ban pool not found');
  }

  return await prisma.mapBanPool.update({
    where: { id },
    data: { isActive: !pool.isActive },
  });
}

/**
 * Add maps to a pool
 *
 * Business logic validation:
 * - Pool must exist
 * - Skips arenas that are already in the pool
 */
export async function addMapsToPool(poolId: number, arenaIds: number[]) {
  if (!arenaIds || arenaIds.length === 0) {
    throw new Error('Please select at least one map');
  }

  // Get current max order number
  const existingMaps = await prisma.mapInPool.findMany({
    where: { poolId },
    orderBy: { orderNum: 'desc' },
    take: 1,
  });

  let nextOrderNum = existingMaps.length > 0 ? existingMaps[0].orderNum + 1 : 0;

  // Add each arena to the pool
  for (const arenaId of arenaIds) {
    // Check if already exists
    const existing = await prisma.mapInPool.findUnique({
      where: {
        poolId_arenaId: { poolId, arenaId },
      },
    });

    if (!existing) {
      await prisma.mapInPool.create({
        data: {
          poolId,
          arenaId,
          orderNum: nextOrderNum++,
        },
      });
    }
  }
}

/**
 * Remove a map from a pool
 */
export async function removeMapFromPool(poolId: number, arenaId: number) {
  await prisma.mapInPool.delete({
    where: {
      poolId_arenaId: { poolId, arenaId },
    },
  });
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
  // Check if pool exists
  const pool = await prisma.mapBanPool.findUnique({
    where: { id },
    include: {
      _count: {
        select: { matchMapBans: true },
      },
    },
  });

  if (!pool) {
    throw new Error('Map ban pool not found');
  }

  // Check if pool is used by any matches
  if (pool._count.matchMapBans > 0) {
    throw new Error(`Cannot delete pool with ${pool._count.matchMapBans} matches using it.`);
  }

  // Delete associated maps first
  await prisma.mapInPool.deleteMany({
    where: { poolId: id },
  });

  // Then delete the pool
  return await prisma.mapBanPool.delete({ where: { id } });
}
