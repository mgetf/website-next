/**
 * Championship Service
 *
 * All championship-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all championships ordered by most recent first
 */
export async function getAllChampionships() {
  const championships = await prisma.championship.findMany({
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      name: true,
      winner: true,
      status: true,
      startedAt: true,
      endedAt: true,
      avatar: true,
      winnerUser: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
      participants: {
        select: {
          id: true,
          steamId: true,
          seed: true,
          eliminated: true,
          player: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
        },
        orderBy: { seed: 'asc' },
      },
      _count: {
        select: {
          participants: true,
          matches: true,
        },
      },
    },
  });

  return championships;
}

/**
 * Get a single championship by ID with full details
 */
export async function getChampionshipById(id: number) {
  const championship = await prisma.championship.findUnique({
    where: { id },
    include: {
      winnerUser: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
      participants: {
        include: {
          player: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
        },
        orderBy: { seed: 'asc' },
      },
      matches: {
        include: {
          player1: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
          player2: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
          winner: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
          loser: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
          games: {
            include: {
              arena: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
            orderBy: { gameNumber: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  return championship;
}

/**
 * Get the latest championship with winner info
 * Used by homepage
 */
export async function getLatestChampionship() {
  const latestChampionship = await prisma.championship.findFirst({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      winner: true,
      status: true,
      startedAt: true,
      endedAt: true,
      avatar: true,
    },
  });

  if (!latestChampionship) {
    return null;
  }

  // Get winner info if championship is complete
  let winner = null;
  if (latestChampionship.winner && latestChampionship.status !== 'REGISTRATION') {
    winner = await prisma.user.findUnique({
      where: { steamId: latestChampionship.winner },
      select: {
        steamId: true,
        steamUsername: true,
        steamAvatar: true,
      },
    });
  }

  // Determine next championship date
  let nextDate = 'TBD 2025';
  if (latestChampionship.status === 'IN_PROGRESS') {
    nextDate = 'In Progress';
  } else if (latestChampionship.status === 'COMPLETED') {
    nextDate = 'Completed';
  }

  return {
    id: latestChampionship.id,
    name: latestChampionship.name,
    winner,
    status: latestChampionship.status,
    startedAt: latestChampionship.startedAt,
    endedAt: latestChampionship.endedAt,
    avatar: latestChampionship.avatar,
    nextDate,
  };
}
