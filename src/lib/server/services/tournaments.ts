/**
 * Tournament Service
 *
 * All tournament-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

// =============================================================================
// TOURNAMENT CRUD OPERATIONS
// =============================================================================

/**
 * Create a new tournament
 */
export async function createTournament(data: {
  name: string;
  description?: string;
  bracketLink?: string;
  avatar?: string;
  startedAt?: Date;
  isTeamTournament?: boolean;
}) {
  return await prisma.tournament.create({
    data: {
      name: data.name,
      description: data.description || null,
      bracketLink: data.bracketLink || null,
      avatar: data.avatar || null,
      startedAt: data.startedAt || null,
      isTeamTournament: data.isTeamTournament ?? false,
    },
  });
}

/**
 * Update tournament winners
 */
export async function updateTournamentWinners(
  tournamentId: number,
  winners: {
    winner1SteamId?: string;
    winner2SteamId?: string;
    secondPlace1SteamId?: string;
    secondPlace2SteamId?: string;
    thirdPlace1SteamId?: string;
    thirdPlace2SteamId?: string;
  },
) {
  // Ensure users exist for all provided Steam IDs
  const steamIds = Object.values(winners).filter(Boolean) as string[];

  for (const steamId of steamIds) {
    const userExists = await prisma.user.findUnique({ where: { steamId } });
    if (!userExists) {
      // Create placeholder user if they don't exist
      await prisma.user.create({
        data: {
          steamId,
          steamUsername: 'Unknown',
          steamAvatar: '',
        },
      });
    }
  }

  return await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      winner1SteamId: winners.winner1SteamId || null,
      winner2SteamId: winners.winner2SteamId || null,
      secondPlace1SteamId: winners.secondPlace1SteamId || null,
      secondPlace2SteamId: winners.secondPlace2SteamId || null,
      thirdPlace1SteamId: winners.thirdPlace1SteamId || null,
      thirdPlace2SteamId: winners.thirdPlace2SteamId || null,
    },
  });
}

// =============================================================================
// TOURNAMENT QUERIES
// =============================================================================

/**
 * Get all tournaments (cups) ordered by most recent first
 */
export async function getAllTournaments() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      bracketLink: true,
      avatar: true,
      startedAt: true,
      winner1SteamId: true,
      winner2SteamId: true,
      secondPlace1SteamId: true,
      secondPlace2SteamId: true,
      thirdPlace1SteamId: true,
      thirdPlace2SteamId: true,
      isTeamTournament: true,
      winner1: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
      winner2: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
    },
  });

  return tournaments;
}

/**
 * Get a single tournament by ID with full details including winners
 */
export async function getTournamentById(id: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      bracketLink: true,
      avatar: true,
      startedAt: true,
      winner1SteamId: true,
      winner2SteamId: true,
      secondPlace1SteamId: true,
      secondPlace2SteamId: true,
      thirdPlace1SteamId: true,
      thirdPlace2SteamId: true,
      isTeamTournament: true,
    },
  });

  if (!tournament) {
    return null;
  }

  // Get winner users if they exist
  const [
    winner1,
    winner2,
    secondPlace1,
    secondPlace2,
    thirdPlace1,
    thirdPlace2,
  ] = await Promise.all([
    tournament.winner1SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.winner1SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
    tournament.winner2SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.winner2SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
    tournament.secondPlace1SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.secondPlace1SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
    tournament.secondPlace2SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.secondPlace2SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
    tournament.thirdPlace1SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.thirdPlace1SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
    tournament.thirdPlace2SteamId
      ? prisma.user.findUnique({
          where: { steamId: tournament.thirdPlace2SteamId },
          select: { steamId: true, steamUsername: true, steamAvatar: true },
        })
      : null,
  ]);

  return {
    ...tournament,
    winner1,
    winner2,
    secondPlace1,
    secondPlace2,
    thirdPlace1,
    thirdPlace2,
  };
}

/**
 * Get all Fight Night events ordered by most recent first
 */
export async function getAllFightNights() {
  const fightNights = await prisma.fightNight.findMany({
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      card: true,
      description: true,
      prizepool: true,
      startedAt: true,
      matchups: {
        select: {
          id: true,
          orderNum: true,
          winnerId: true,
          winnerScore: true,
          loserScore: true,
          boSeries: true,
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
        },
        orderBy: { orderNum: 'asc' },
      },
    },
  });

  return fightNights;
}

/**
 * Get a single Fight Night by ID with full details
 */
export async function getFightNightById(id: number) {
  const fightNight = await prisma.fightNight.findUnique({
    where: { id },
    include: {
      matchups: {
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
          games: {
            include: {
              arena: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },
            },
            orderBy: { gameNumber: 'asc' },
          },
        },
        orderBy: { orderNum: 'asc' },
      },
    },
  });

  return fightNight;
}

/**
 * Get the latest tournament with winner info
 * Used by homepage
 */
export async function getLatestTournament() {
  const latestTournament = await prisma.tournament.findFirst({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      bracketLink: true,
      avatar: true,
      startedAt: true,
      winner1SteamId: true,
      winner2SteamId: true,
      secondPlace1SteamId: true,
      secondPlace2SteamId: true,
      thirdPlace1SteamId: true,
      thirdPlace2SteamId: true,
      isTeamTournament: true,
    },
  });

  if (!latestTournament) {
    return null;
  }

  // Get winner info if exists
  let winner = null;
  if (latestTournament.winner1SteamId) {
    winner = await prisma.user.findUnique({
      where: { steamId: latestTournament.winner1SteamId },
      select: {
        steamId: true,
        steamUsername: true,
        steamAvatar: true,
      },
    });
  }

  // Format winner date
  let winnerDate = 'TBD';
  if (latestTournament.startedAt) {
    try {
      const date = new Date(latestTournament.startedAt);
      if (!isNaN(date.getTime())) {
        winnerDate = date.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        });
      } else {
        winnerDate = 'Recently';
      }
    } catch {
      winnerDate = 'Recently';
    }
  }

  return {
    id: latestTournament.id,
    name: latestTournament.name,
    description: latestTournament.description,
    bracketLink: latestTournament.bracketLink,
    avatar: latestTournament.avatar,
    startedAt: latestTournament.startedAt,
    winner,
    winnerDate,
    prizePool: '$250', // TODO: Add to database schema if needed
    isTeamTournament: latestTournament.isTeamTournament,
  };
}

/**
 * Get recent tournament activity across all types (Cups, Championships, Fight Nights)
 * Returns the 3 most recent events for homepage preview
 */
export async function getRecentTournamentActivity() {
  // TEMPORARY WORKAROUND: Exclude championships to avoid duplicates with tournaments table
  // TODO: Fix schema to have single source of truth for all tournament types
  const [tournaments, fightNights] = await Promise.all([
    prisma.tournament.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        name: true,
        startedAt: true,
        isTeamTournament: true,
        winner1: {
          select: {
            steamId: true,
            steamUsername: true,
            steamAvatar: true,
          },
        },
      },
    }),
    prisma.fightNight.findMany({
      take: 3,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        card: true,
        startedAt: true,
        matchups: {
          select: {
            id: true,
          },
        },
      },
    }),
  ]);

  type RecentEvent = {
    type: 'cup' | 'championship' | 'fightnight';
    id: number;
    name: string;
    date: Date | null;
    icon: string;
    format?: string;
    winner?: {
      steamId: string;
      steamUsername: string;
      steamAvatar: string | null;
    } | null;
    matchupCount?: number;
  };

  const allEvents: RecentEvent[] = [
    ...tournaments.map((t) => ({
      type: 'cup' as const,
      id: t.id,
      name: t.name,
      date: t.startedAt,
      icon: '🏆',
      format: t.isTeamTournament ? '2v2' : '1v1',
      winner: t.winner1,
    })),
    ...fightNights.map((f) => ({
      type: 'fightnight' as const,
      id: f.id,
      name: f.card || `Fight Night #${f.id}`,
      date: f.startedAt,
      icon: '🥊',
      matchupCount: f.matchups?.length || 0,
    })),
  ];

  allEvents.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const [cupCount, championshipCount, fightNightCount] = await Promise.all([
    prisma.tournament.count(),
    prisma.$queryRaw<
      [{ count: bigint }]
    >`SELECT COUNT(*) as count FROM championship`,
    prisma.fightNight.count(),
  ]);

  return {
    recentEvents: allEvents.slice(0, 3),
    totalCounts: {
      cups: cupCount,
      championships: Number(championshipCount[0]?.count || 0),
      fightNights: fightNightCount,
    },
  };
}
