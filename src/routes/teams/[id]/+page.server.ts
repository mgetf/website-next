import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { getTeamById, updateTeamStatus, changeTeamDivision } from '$lib/server/services/teams';
import { isAdmin, isTeamAdmin } from '$lib/server/auth/permissions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { removePlayer } from '$lib/server/services/teamManagement';
import { markPlayerAsPaidManually } from '$lib/server/services/payments';
import { isSeasonCurrentlyActive, getEffectiveRosterLock } from '$lib/server/services/settings';
import { calculateWeekLabel } from '$lib/server/utils/matchHelpers';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import {
  getPendingStatusForTeam,
  hasAnyPendingRequest,
  acceptTeamInvite,
  declineInvitation,
} from '$lib/server/services/teamJoin';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const teamId = parseInt(params.id);

  if (isNaN(teamId)) {
    throw error(400, 'Invalid team ID');
  }

  const paymentSuccess = url.searchParams.get('payment') === 'success';
  const signupSuccess = url.searchParams.get('signup');

  // Fetch team with related data
  const team = await getTeamById(teamId);

  if (!team) {
    throw error(404, 'Team not found');
  }

  // Redirect 1v1 "teams" to the player's profile page
  // 1v1 teams are implementation details - users should never see them as teams
  if (team.formatId === FORMAT_1V1) {
    // Find any player (active or inactive) - 1v1 teams always have exactly one player
    const player = team.players.find((p) => p.active === 1) || team.players[0];
    if (player) {
      throw redirect(301, `/users/${player.playerSteamId}`);
    }
    // If somehow no player found at all, redirect to home
    throw redirect(301, '/');
  }

  // Check if user has admin permissions
  const isGlobalAdmin = locals.user ? isAdmin(locals.user) : false;
  const isTeamAdminUser = locals.user ? await isTeamAdmin(locals.user, teamId) : false;
  const canManageTeam = isGlobalAdmin || isTeamAdminUser;

  const rosterLocked = team.season?.rosterLocked
    ? await isSeasonCurrentlyActive(team.season.id)
    : false;

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
    .filter((p) => p.active === 0 || p.leftAt !== null)
    .map((p) => ({
      steamId: p.player.steamId,
      name: p.player.steamUsername,
      avatar: p.player.steamAvatar,
      joinedAt: p.startedAt,
      leftAt: p.leftAt,
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
    const isDraw = match.winnerId === null && match.status.toString() === 'PLAYED';

    // Calculate week label with proper suffix (1a, 1b, etc.) for multiple match sets
    let weekLabel = 'TBD';
    if (match.weekNo !== null && match.weekNo !== undefined) {
      // Filter THIS team's matches to only those in the same week and season
      // This ensures each team gets their own sequential labeling (1a, 1b, etc.)
      const teamMatchesForThisWeek = allMatches.filter(
        (m) => m.weekNo === match.weekNo && m.season.id === match.season.id,
      );

      // Sort by match ID to ensure consistent ordering
      teamMatchesForThisWeek.sort((a, b) => a.id - b.id);

      // Use centralized helper to calculate label (no code duplication)
      const calculatedLabel = calculateWeekLabel(match, teamMatchesForThisWeek);
      weekLabel = calculatedLabel ? `Week ${calculatedLabel}` : `Week ${match.weekNo}`;
    } else if (match.playoffRound) {
      weekLabel = `Round ${match.playoffRound}`;
    }

    matchesBySeasonMap.get(seasonId)?.push({
      week: weekLabel,
      opponent: match.opponent.name,
      opponentId: match.opponent.id,
      result: isDraw ? 'D' : isWin ? 'W' : match.status.toString() === 'PLAYED' ? 'L' : 'TBD',
      score: match.winnerId
        ? `${match.winnerScore} - ${match.loserScore}`
        : match.status.toString() === 'PLAYED'
          ? 'N/A'
          : 'Unplayed',
      date: match.matchDateTime,
      matchId: match.id,
    });
  }

  // Convert map to array and sort by season number (descending)
  const matchesBySeason = Array.from(matchesBySeasonMap.entries())
    .map(([seasonId, matches]) => {
      const seasonData = allMatches.find((m) => m.season.id === seasonId)?.season;
      return {
        seasonId,
        season: `Season ${seasonData?.seasonNum || seasonId}`,
        matches,
      };
    })
    .sort((a, b) => b.seasonId - a.seasonId);

  const currentUserSteamId = locals.user?.steamId || null;
  const currentUserInTeam = currentUserSteamId
    ? team.players.find((p) => p.playerSteamId === currentUserSteamId && p.active === 1)
    : null;
  const isOnTeam = !!currentUserInTeam;
  const isOwner = currentUserInTeam?.permissionLevel === 2;

  const pendingStatus =
    currentUserSteamId && !isOnTeam
      ? await getPendingStatusForTeam(currentUserSteamId, teamId)
      : null;

  const hasPendingRequestElsewhere =
    currentUserSteamId && !isOnTeam && pendingStatus === null
      ? await hasAnyPendingRequest(currentUserSteamId)
      : false;

  // Load divisions for admin division-change control (only needed for global admins)
  const allDivisions = isGlobalAdmin ? await getVisibleDivisions() : [];
  const divisions =
    isGlobalAdmin && team.regionId
      ? allDivisions.filter((d) => d.regionId === team.regionId)
      : allDivisions;

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
      divisionId: team.division?.id ?? null,
      regionId: team.regionId ?? null,
      region: team.region?.name,
      status: team.status,
      createdAt: team.createdAt,
      seasonNum: team.season?.seasonNum,
    },
    currentRoster,
    pastRoster,
    matchesBySeason,
    divisions,
    canManageTeam,
    isGlobalAdmin,
    isAuthenticated: !!locals.user,
    isOnTeam,
    isOwner,
    pendingStatus,
    hasPendingRequestElsewhere,
    rosterLocked,
    currentUserSteamId,
    paymentSuccess,
    signupSuccess,
  };
};

export const actions: Actions = {
  removePlayer: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);
    const isGlobalAdmin = isAdmin(locals.user);
    const isTeamAdminUser = await isTeamAdmin(locals.user, teamId);

    if (!isGlobalAdmin && !isTeamAdminUser) {
      return fail(403, { error: 'You must be a team admin or global admin' });
    }

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    if (!playerSteamId) {
      return fail(400, { error: 'Player Steam ID is required' });
    }

    const rosterLocked = await getEffectiveRosterLock(teamId);

    if (rosterLocked && !isGlobalAdmin) {
      return fail(403, { error: 'Rosters are currently locked' });
    }

    try {
      await removePlayer(teamId, playerSteamId);
      return { success: true, message: 'Player removed successfully' };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : 'Failed to remove player',
      });
    }
  },

  updateStatus: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);
    const isGlobalAdmin = isAdmin(locals.user);

    if (!isGlobalAdmin) {
      return fail(403, { error: 'Only global admins can change team status' });
    }

    const formData = await request.formData();
    const status = formData.get('status') as string;

    if (!status) {
      return fail(400, { error: 'Status is required' });
    }

    try {
      await updateTeamStatus(teamId, status as any);
      return { success: true, message: 'Team status updated successfully' };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : 'Failed to update team status',
      });
    }
  },

  acceptInvitation: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);

    try {
      await acceptTeamInvite(locals.user.steamId, teamId);
      return { success: true, message: 'Join request submitted! An admin will review it shortly.' };
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to accept invitation',
      });
    }
  },

  declineInvitation: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);

    try {
      await declineInvitation(locals.user.steamId, teamId);
      return { success: true, message: 'Invitation declined' };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : 'Failed to decline invitation',
      });
    }
  },

  leaveTeam: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);

    const rosterLocked = await getEffectiveRosterLock(teamId);

    if (rosterLocked) {
      return fail(403, { error: 'Rosters are currently locked' });
    }

    try {
      await removePlayer(teamId, locals.user.steamId);
      return { success: true, message: 'You have left the team' };
    } catch (err) {
      return fail(500, {
        error: err instanceof Error ? err.message : 'Failed to leave team',
      });
    }
  },

  markPlayerPaid: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Only global admins can manually mark players as paid' });
    }

    const teamId = parseInt(params.id);
    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    if (!playerSteamId) {
      return fail(400, { error: 'Player Steam ID is required' });
    }

    try {
      await markPlayerAsPaidManually(playerSteamId, teamId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.PAYMENT_MARKED_MANUALLY,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player marked as paid' };
    } catch (err) {
      return fail(err instanceof Error && 'status' in (err as any) ? (err as any).status : 500, {
        error: err instanceof Error ? err.message : 'Failed to mark player as paid',
      });
    }
  },

  changeDivision: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Only global admins can change team division' });
    }

    const teamId = parseInt(params.id);
    const formData = await request.formData();
    const divisionIdRaw = formData.get('divisionId');
    const divisionId = divisionIdRaw ? parseInt(divisionIdRaw as string) : NaN;

    if (isNaN(divisionId) || divisionId <= 0) {
      return fail(400, { error: 'A valid division is required' });
    }

    try {
      const result = await changeTeamDivision(teamId, divisionId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_DIVISION_CHANGED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          divisionIdBefore: result.oldDivision?.id ?? null,
          divisionNameBefore: result.oldDivision?.name ?? null,
          divisionIdAfter: result.newDivision.id,
          divisionNameAfter: result.newDivision.name,
          paymentStatusReset: result.paymentStatusReset,
          notifiedPlayers: result.notifiedPlayerSteamIds,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `Division changed to ${result.newDivision.name}` };
    } catch (err) {
      return fail(err instanceof Error && 'status' in (err as any) ? (err as any).status : 500, {
        error: err instanceof Error ? err.message : 'Failed to change division',
      });
    }
  },
};
