/**
 * Moderators Service
 *
 * All staff/moderator-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all moderators with their user info and division
 * Used for staff lists and admin management
 */
export async function getModerators() {
  return await prisma.moderator.findMany({
    include: {
      user: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
          permissionLevel: true,
        },
      },
      division: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { divisionId: 'desc' }, // Higher divisions first
      { user: { steamUsername: 'asc' } }, // Then alphabetically
    ],
  });
}

/**
 * Get a single moderator by Steam ID
 */
export async function getModeratorBySteamId(steamId: string) {
  return await prisma.moderator.findUnique({
    where: { steamId },
    include: {
      user: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
          permissionLevel: true,
        },
      },
      division: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Get moderators by division
 * Useful for showing division-specific staff
 */
export async function getModeratorsByDivision(divisionId: number) {
  return await prisma.moderator.findMany({
    where: { divisionId },
    include: {
      user: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
          permissionLevel: true,
        },
      },
    },
    orderBy: {
      user: { steamUsername: 'asc' },
    },
  });
}

/**
 * Create a new moderator
 *
 * Business logic validation:
 * - User must exist
 * - User cannot already be a moderator
 * - Division must exist if provided
 */
export async function createModerator(data: {
  steamId: string;
  staffType?: number;
  divisionId?: number;
}) {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { steamId: data.steamId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if already a moderator
  const existingMod = await prisma.moderator.findUnique({
    where: { steamId: data.steamId },
  });

  if (existingMod) {
    throw new Error('User is already a moderator');
  }

  // Check division exists if provided
  if (data.divisionId) {
    const division = await prisma.division.findUnique({
      where: { id: data.divisionId },
    });

    if (!division) {
      throw new Error('Division not found');
    }
  }

  return await prisma.moderator.create({
    data: {
      steamId: data.steamId,
      staffType: data.staffType,
      divisionId: data.divisionId,
    },
  });
}

/**
 * Update a moderator's details
 */
export async function updateModerator(
  steamId: string,
  data: {
    staffType?: number;
    divisionId?: number;
  },
) {
  // Check if moderator exists
  const moderator = await prisma.moderator.findUnique({
    where: { steamId },
  });

  if (!moderator) {
    throw new Error('Moderator not found');
  }

  // Check division exists if provided
  if (data.divisionId !== undefined) {
    const division = await prisma.division.findUnique({
      where: { id: data.divisionId },
    });

    if (!division && data.divisionId !== null) {
      throw new Error('Division not found');
    }
  }

  return await prisma.moderator.update({
    where: { steamId },
    data: {
      staffType: data.staffType,
      divisionId: data.divisionId,
    },
  });
}

/**
 * Delete a moderator
 */
export async function deleteModerator(steamId: string) {
  // Check if moderator exists
  const moderator = await prisma.moderator.findUnique({
    where: { steamId },
  });

  if (!moderator) {
    throw new Error('Moderator not found');
  }

  return await prisma.moderator.delete({
    where: { steamId },
  });
}
