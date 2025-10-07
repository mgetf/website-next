import type { PageServerLoad } from "./$types";
import { prisma } from "$lib/server/db";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params }) => {
  const teamId = parseInt(params.id);

  if (isNaN(teamId)) {
    throw error(400, "Invalid team ID");
  }

  // Fetch team with related data
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: true,
      region: true,
      season: true,
      players: {
        include: {
          player: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
        },
        orderBy: {
          startedAt: "asc",
        },
      },
      homeMatches: {
        include: {
          awayTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: "desc",
        },
      },
      awayMatches: {
        include: {
          homeTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: "desc",
        },
      },
    },
  });

  if (!team) {
    throw error(404, "Team not found");
  }

  // Separate active and inactive players
  const currentRoster = team.players
    .filter((p) => p.active === 1)
    .map((p) => ({
      steamId: p.player.steamId,
      name: p.player.steamUsername,
      avatar: p.player.steamAvatar,
      joinedAt: p.startedAt,
      isPaid: p.paymentStatus === 1,
      isLeader: p.permissionLevel >= 1, // ADMIN (1) or STATUS (2)
      permissionLevel: p.permissionLevel,
    }));

  const pastRoster = team.players
    .filter((p) => p.active === 0 || p.leftAt !== "0")
    .map((p) => ({
      steamId: p.player.steamId,
      name: p.player.steamUsername,
      avatar: p.player.steamAvatar,
      joinedAt: p.startedAt,
      leftAt: p.leftAt !== "0" ? new Date(parseInt(p.leftAt) * 1000) : null,
    }));

  // Combine and organize matches by season
  const allMatches = [
    ...team.homeMatches.map((m) => ({
      ...m,
      opponent: m.awayTeam,
      isHome: true,
    })),
    ...team.awayMatches.map((m) => ({
      ...m,
      opponent: m.homeTeam,
      isHome: false,
    })),
  ].sort((a, b) => {
    const dateA = a.matchDateTime?.getTime() || 0;
    const dateB = b.matchDateTime?.getTime() || 0;
    return dateB - dateA; // Most recent first
  });

  // Group matches by season
  const matchesBySeasonMap = new Map<number, any[]>();

  for (const match of allMatches) {
    const seasonId = match.season.id;
    if (!matchesBySeasonMap.has(seasonId)) {
      matchesBySeasonMap.set(seasonId, []);
    }

    const isWin = match.winnerId === teamId;
    const isDraw =
      match.winnerId === null && match.status.toString() === "PLAYED";

    matchesBySeasonMap.get(seasonId)?.push({
      week: match.weekNo
        ? `Week ${match.weekNo}`
        : match.playoffRound
        ? `Round ${match.playoffRound}`
        : "TBD",
      opponent: match.opponent.name,
      opponentId: match.opponent.id,
      result: isDraw
        ? "D"
        : isWin
        ? "W"
        : match.status.toString() === "PLAYED"
        ? "L"
        : "TBD",
      score: match.winnerId
        ? `${match.winnerScore} - ${match.loserScore}`
        : match.status.toString() === "PLAYED"
        ? "N/A"
        : "Unplayed",
      date: match.matchDateTime,
      matchId: match.id,
    });
  }

  // Convert map to array and sort by season number (descending)
  const matchesBySeason = Array.from(matchesBySeasonMap.entries())
    .map(([seasonId, matches]) => {
      const seasonData = allMatches.find(
        (m) => m.season.id === seasonId
      )?.season;
      return {
        seasonId,
        season: `Season ${seasonData?.seasonNum || seasonId}`,
        matches,
      };
    })
    .sort((a, b) => b.seasonId - a.seasonId);

  return {
    team: {
      id: team.id,
      name: team.name,
      acronym: team.acronym,
      avatar: team.avatar,
      wins: team.wins,
      losses: team.losses,
      gamesWon: team.gamesWon,
      gamesLost: team.gamesLost,
      pointsScored: team.pointsScored,
      pointsScoredAgainst: team.pointsScoredAgainst,
      division: team.division?.name,
      region: team.region?.name,
      status: team.status,
      createdAt: team.createdAt,
      seasonNum: team.season?.seasonNum,
    },
    currentRoster,
    pastRoster,
    matchesBySeason,
  };
};
