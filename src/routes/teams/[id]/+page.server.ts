import type { PageServerLoad, Actions } from "./$types";
import { error, fail, redirect } from "@sveltejs/kit";
import { getTeamById } from "$lib/server/services/teams";
import { isAdmin, isTeamAdmin } from "$lib/server/auth/permissions";
import { removePlayer } from "$lib/server/services/teamManagement";
import { getGlobalSettings } from "$lib/server/services/settings";
import { prisma } from "$lib/server/db";

export const load: PageServerLoad = async ({ params, locals }) => {
  const teamId = parseInt(params.id);

  if (isNaN(teamId)) {
    throw error(400, "Invalid team ID");
  }

  // Fetch team with related data
  const team = await getTeamById(teamId);

  if (!team) {
    throw error(404, "Team not found");
  }

  // Check if user has admin permissions
  const isGlobalAdmin = locals.user ? isAdmin(locals.user) : false;
  const isTeamAdminUser = locals.user ? await isTeamAdmin(locals.user, teamId) : false;
  const canManageTeam = isGlobalAdmin || isTeamAdminUser;

  // Get roster lock status
  const settings = await getGlobalSettings();
  const rosterLocked = settings?.rosterLocked === 1;

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
    canManageTeam,
    isGlobalAdmin,
    rosterLocked,
    currentUserSteamId: locals.user?.steamId || null,
  };
};

export const actions: Actions = {
  removePlayer: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "You must be logged in" });
    }

    const teamId = parseInt(params.id);
    const isGlobalAdmin = isAdmin(locals.user);
    const isTeamAdminUser = await isTeamAdmin(locals.user, teamId);

    if (!isGlobalAdmin && !isTeamAdminUser) {
      return fail(403, { error: "You must be a team admin or global admin" });
    }

    const formData = await request.formData();
    const playerSteamId = formData.get("playerSteamId") as string;

    if (!playerSteamId) {
      return fail(400, { error: "Player Steam ID is required" });
    }

    // Check roster lock (admins can bypass)
    const settings = await getGlobalSettings();
    const rosterLocked = settings?.rosterLocked === 1;

    if (rosterLocked && !isGlobalAdmin) {
      return fail(403, { error: "Rosters are currently locked" });
    }

    try {
      await removePlayer(teamId, playerSteamId);
      return { success: true, message: "Player removed successfully" };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : "Failed to remove player",
      });
    }
  },

  updateStatus: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "You must be logged in" });
    }

    const teamId = parseInt(params.id);
    const isGlobalAdmin = isAdmin(locals.user);

    if (!isGlobalAdmin) {
      return fail(403, { error: "Only global admins can change team status" });
    }

    const formData = await request.formData();
    const status = formData.get("status") as string;

    if (!status) {
      return fail(400, { error: "Status is required" });
    }

    await prisma.team.update({
      where: { id: teamId },
      data: { status: status as any },
    });

    return { success: true, message: "Team status updated successfully" };
  },

  deleteTeam: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "You must be logged in" });
    }

    const teamId = parseInt(params.id);
    const isGlobalAdmin = isAdmin(locals.user);

    if (!isGlobalAdmin) {
      return fail(403, {
        error: "Only global admins can permanently delete teams",
      });
    }

    // Check if team has any matches
    const matchCount = await prisma.match.count({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    });

    if (matchCount > 0) {
      return fail(400, {
        error: "Cannot delete team that has played matches. Set status to DEAD instead.",
      });
    }

    // Delete related records first
    await prisma.playerInTeam.deleteMany({
      where: { teamId },
    });

    await prisma.pendingPlayer.deleteMany({
      where: { teamId },
    });

    await prisma.teamNameHistory.deleteMany({
      where: { teamId },
    });

    // Delete team
    await prisma.team.delete({
      where: { id: teamId },
    });

    // Redirect to admin teams page after deletion
    throw redirect(303, "/admin/teams");
  },
};
