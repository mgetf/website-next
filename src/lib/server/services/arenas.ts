/**
 * Arena Service
 *
 * All arena-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all arenas with their game counts
 */
export async function getArenas() {
  return await prisma.arena.findMany({
    include: {
      _count: {
        select: {
          games: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
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
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Arena name is required');
  }

  // Check if arena already exists (case-insensitive)
  const existingArena = await prisma.arena.findFirst({
    where: { name: { equals: trimmedName, mode: 'insensitive' } },
  });

  if (existingArena) {
    throw new Error('Arena with this name already exists');
  }

  return await prisma.arena.create({
    data: {
      name: trimmedName,
      avatar: data.avatar?.trim() || null,
      playoffMap: data.playoffMap,
    },
  });
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
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Arena name is required');
  }

  // Check if arena exists
  const arena = await prisma.arena.findUnique({ where: { id } });
  if (!arena) {
    throw new Error('Arena not found');
  }

  // Check for name conflicts (case-insensitive)
  const conflictingArena = await prisma.arena.findFirst({
    where: {
      name: { equals: trimmedName, mode: 'insensitive' },
      NOT: { id },
    },
  });

  if (conflictingArena) {
    throw new Error('Arena with this name already exists');
  }

  return await prisma.arena.update({
    where: { id },
    data: {
      name: trimmedName,
      avatar: data.avatar?.trim() || null,
      playoffMap: data.playoffMap,
    },
  });
}

/**
 * Delete an arena
 *
 * Business logic validation:
 * - Arena must exist
 * - Arena must not have any games played on it
 */
export async function deleteArena(id: number) {
  // Check if arena exists
  const arena = await prisma.arena.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          games: true,
        },
      },
    },
  });

  if (!arena) {
    throw new Error('Arena not found');
  }

  // Check if arena has games
  if (arena._count.games > 0) {
    throw new Error(`Cannot delete arena with ${arena._count.games} games played on it.`);
  }

  return await prisma.arena.delete({
    where: { id },
  });
}
