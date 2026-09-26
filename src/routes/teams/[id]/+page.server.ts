import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError, formError } from '$lib/server/utils/forms';
import {
  getTeamById,
  getTeamEventPlacements,
  getTeamAuditSnapshot,
  adminSetTeamStatus,
  changeTeamDivision,
  toggleTeamReady,
} from '$lib/server/services/teams';
import { isAdmin, isTeamAdmin, requireAuth, requireTeamAdmin } from '$lib/server/auth/permissions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import {
  getTeamForEdit,
  updateTeamInfo,
  uploadTeamAvatar,
  removePlayer,
  promotePlayer,
  demotePlayer,
  invitePlayerBySteamId,
  disbandTeam,
} from '$lib/server/services/teamManagement';
import { markPlayerAsPaidManually, unmarkPlayerAsPaid } from '$lib/server/services/payments';
import { generateJoinToken } from '$lib/server/services/teamSignup';
import { isSeasonCurrentlyActive, getEffectiveRosterLock } from '$lib/server/services/settings';
import { calculateWeekLabel, uniqueMatchArenas } from '$lib/server/utils/matchHelpers';
import { compareMatchHistoryOrder, formatPlayoffRound } from '$lib/utils/playoffs';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import {
  getPendingStatusForTeam,
  hasAnyPendingRequest,
  acceptTeamInvite,
  declineInvitation,
} from '$lib/server/services/teamJoin';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getErrorMessage } from '$lib/server/utils/errors';
import { getByeWeeksForTeam } from '$lib/server/services/byeWeeks';
import { buildPageSeo } from '$lib/utils/seo';
import type { TeamMatchRow } from '$lib/types/team';

const playerSteamIdSchema = z.object({
  playerSteamId: z.string().min(1, 'Player Steam ID is required'),
});

const updateStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
});

const changeDivisionSchema = z.object({
  divisionId: z.coerce.number().int().positive('A valid division is required'),
});

const updateInfoSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  acronym: z.string().optional().default(''),
});

const updatePasswordSchema = z.object({
  joinPassword: z.string().default(''),
});

const invitePlayerSchema = z.object({
  steamId: z.string().min(1, 'Steam ID is required'),
});

type MatchHistoryDraft = TeamMatchRow & {
  weekNo?: number | null;
  playoffRound?: number | null;
  seasonNum?: number;
};

function teamPerspectiveScore(
  isWin: boolean,
  isDraw: boolean,
  winnerScore: number | null,
  loserScore: number | null,
): string | null {
  if (winnerScore == null || loserScore == null) return null;
  if (isDraw || isWin) return `${winnerScore} - ${loserScore}`;
  return `${loserScore} - ${winnerScore}`;
}

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

  const seasonActive = team.season ? await isSeasonCurrentlyActive(team.season.id) : false;

  const rosterLocked = team.season?.rosterLocked ? seasonActive : false;

  // Separate active and inactive players
  const currentRoster = team.players
    .filter((p) => p.active === 1)
    .map((p) => ({
      steamId: p.player.steamId,
      name: p.player.steamUsername,
      avatar: p.player.steamAvatar,
      joinedAt: p.startedAt,
      isPaid: p.paymentStatus !== 0,
      paymentStatus: p.paymentStatus,
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

  const [byeWeeks, achievements] = await Promise.all([
    getByeWeeksForTeam(teamId),
    getTeamEventPlacements(team.name, team.acronym),
  ]);

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
  ];

  // Group matches by season
  const matchesBySeasonMap = new Map<number, MatchHistoryDraft[]>();

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
    } else if (match.playoffRound != null) {
      weekLabel = formatPlayoffRound(match.playoffRound);
    }

    matchesBySeasonMap.get(seasonId)?.push({
      week: weekLabel,
      weekNo: match.weekNo,
      playoffRound: match.playoffRound,
      opponent: match.opponent.name,
      opponentId: match.opponent.id,
      opponentAvatar: match.opponent.avatar,
      result: isDraw ? 'D' : isWin ? 'W' : match.status.toString() === 'PLAYED' ? 'L' : 'TBD',
      score: teamPerspectiveScore(isWin, isDraw, match.winnerScore, match.loserScore),
      matchId: match.id,
      arenas: uniqueMatchArenas(match.games),
    });
  }

  // Merge bye weeks into the season map
  for (const bye of byeWeeks) {
    const seasonId = bye.seasonId;
    if (!matchesBySeasonMap.has(seasonId)) {
      matchesBySeasonMap.set(seasonId, []);
    }
    matchesBySeasonMap.get(seasonId)?.push({
      type: 'bye' as const,
      week: `Week ${bye.weekNo}`,
      weekNo: bye.weekNo,
      playoffRound: null,
      opponent: null,
      opponentId: null,
      opponentAvatar: null,
      result: 'BYE' as const,
      score: null,
      matchId: null,
      arenas: [],
      seasonNum: bye.season.seasonNum,
    });
  }

  // Build a lookup for season nums from bye weeks (for seasons that may have no matches)
  const byeSeasonNums = new Map(byeWeeks.map((b) => [b.seasonId, b.season.seasonNum]));

  // Convert map to array and sort by season number (descending)
  const matchesBySeason = Array.from(matchesBySeasonMap.entries())
    .map(([seasonId, matches]) => {
      const seasonData = allMatches.find((m) => m.season.id === seasonId)?.season;
      const seasonNum = seasonData?.seasonNum ?? byeSeasonNums.get(seasonId) ?? seasonId;

      // Regular-season weeks first, then playoffs in bracket order
      matches.sort((a, b) =>
        compareMatchHistoryOrder(
          { weekNo: a.weekNo, playoffRound: a.playoffRound, id: a.matchId },
          { weekNo: b.weekNo, playoffRound: b.playoffRound, id: b.matchId },
        ),
      );

      // Strip sort-only fields before returning to the client
      const publicMatches = matches.map(
        ({ weekNo: _weekNo, playoffRound: _playoffRound, ...rest }) => rest,
      );

      return {
        seasonId,
        season: `Season ${seasonNum}`,
        matches: publicMatches,
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
      ? allDivisions.filter((d) => d.regionId === team.regionId && d.formatId === team.formatId)
      : allDivisions;

  let management = null;
  if (canManageTeam && currentUserSteamId) {
    const editData = await getTeamForEdit(teamId, currentUserSteamId);
    const inviteToken = generateJoinToken(teamId);
    management = {
      inviteUrl: `/i/${inviteToken}`,
      maxRosterSize: team.format.maxRosterSize,
      players: editData.players
        .filter((player) => player.active === 1)
        .map((player) => ({
          steamId: player.playerSteamId,
          name: player.player.steamUsername,
          avatar: player.player.steamAvatar,
          permissionLevel: player.permissionLevel,
        })),
      sentInvites: editData.sentInvites.map((invite) => ({
        steamId: invite.playerSteamId,
        name: invite.player.steamUsername,
        avatar: invite.player.steamAvatar,
      })),
      awaitingAdmin: editData.awaitingAdmin.map((invite) => ({
        steamId: invite.playerSteamId,
        name: invite.player.steamUsername,
        avatar: invite.player.steamAvatar,
      })),
    };
  }

  const divisionLabel = [team.division?.name, team.region?.name ? `(${team.region.name})` : null]
    .filter(Boolean)
    .join(' ');
  const seasonLabel = team.season?.seasonNum ? `Season ${team.season.seasonNum}` : null;
  const recordLabel = `${team.wins}-${team.losses}`;
  const seoDescription = [
    team.acronym ? `${team.name} (${team.acronym})` : team.name,
    team.format.name,
    divisionLabel || null,
    seasonLabel,
    `Record ${recordLabel}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    seo: buildPageSeo(url.origin, {
      title: `${team.name} | MGE.tf`,
      description: seoDescription,
      image: team.avatar,
      imageAlt: `${team.name} team avatar`,
      card: 'summary',
      type: 'profile',
    }),
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
      formatName: team.format.name,
      formatThemeKey: team.format.themeKey,
      formatIconUrl: team.format.iconUrl,
      maxRosterSize: team.format.maxRosterSize,
    },
    currentRoster,
    pastRoster,
    matchesBySeason,
    achievements,
    management,
    divisions,
    canManageTeam,
    isGlobalAdmin,
    isAuthenticated: !!locals.user,
    isOnTeam,
    isOwner,
    pendingStatus,
    hasPendingRequestElsewhere,
    rosterLocked,
    isSeasonActive: seasonActive,
    currentUserSteamId,
    paymentSuccess,
    signupSuccess,
    paidPlayerCount: currentRoster.filter((p) => p.isPaid).length,
    requiredPaidPlayers: team.format.requiredPaidPlayers,
    isFreeDivision: !team.division || team.division.signupCost === 0,
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
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { playerSteamId } = validation.data;

    const rosterLocked = await getEffectiveRosterLock(teamId);

    if (rosterLocked && !isGlobalAdmin) {
      return fail(403, { error: 'Rosters are currently locked' });
    }

    try {
      await removePlayer(teamId, playerSteamId);
      return { success: true, message: 'Player removed successfully' };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to remove player') });
    }
  },

  updateStatus: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);

    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Only global admins can change team status' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, updateStatusSchema);
    if (!validation.success) return validationError(validation.errors);

    const { status } = validation.data;

    try {
      await adminSetTeamStatus(teamId, status as any);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_STATUS_CHANGED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { status },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Team status updated successfully' };
    } catch (err) {
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to update team status'),
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
      return fail('status' in (err as any) ? (err as any).status : 400, {
        error: getErrorMessage(err, 'Failed to accept invitation'),
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
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to decline invitation'),
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
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to leave team'),
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
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { playerSteamId } = validation.data;

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
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to mark player as paid'),
      });
    }
  },

  unmarkPlayerPaid: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Only global admins can manually mark players as unpaid' });
    }

    const teamId = parseInt(params.id);
    const formData = await request.formData();
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { playerSteamId } = validation.data;

    try {
      await unmarkPlayerAsPaid(playerSteamId, teamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.PAYMENT_UNMARKED_MANUALLY,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player marked as unpaid' };
    } catch (err) {
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to mark player as unpaid'),
      });
    }
  },

  toggleReady: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const teamId = parseInt(params.id);

    try {
      await toggleTeamReady(teamId, locals.user.steamId);
      return { success: true, message: 'Team marked as ready! Awaiting admin approval.' };
    } catch (err) {
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to toggle ready'),
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
    const validation = validateForm(formData, changeDivisionSchema);
    if (!validation.success) return validationError(validation.errors);

    const { divisionId } = validation.data;

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
      return fail('status' in (err as any) ? (err as any).status : 500, {
        error: getErrorMessage(err, 'Failed to change division'),
      });
    }
  },

  updateInfo: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return formError('Rosters are locked', 400);
    }

    const formData = await request.formData();
    const validation = validateForm(formData, updateInfoSchema);
    if (!validation.success) return validationError(validation.errors);

    const { name, acronym } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      await updateTeamInfo(teamId, { name, acronym });
      const after = await getTeamAuditSnapshot(teamId);
      const changedFields = after
        ? [
            before?.name !== after.name ? 'name' : null,
            before?.acronym !== after.acronym ? 'acronym' : null,
          ].filter((field): field is string => field !== null)
        : [];

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_UPDATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          changedFields: changedFields.join(',') || null,
          nameBefore: before?.name ?? null,
          nameAfter: after?.name ?? null,
          acronymBefore: before?.acronym ?? null,
          acronymAfter: after?.acronym ?? null,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Team info updated successfully' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to update team info'), 400);
    }
  },

  updatePassword: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return formError('Rosters are locked', 400);
    }

    const formData = await request.formData();
    const validation = validateForm(formData, updatePasswordSchema);
    if (!validation.success) return validationError(validation.errors);

    const joinPassword = validation.data.joinPassword.trim();
    if (!joinPassword) {
      return { success: true, message: 'No changes made' };
    }

    try {
      const before = await getTeamAuditSnapshot(teamId);
      await updateTeamInfo(teamId, { joinPassword });
      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_UPDATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          changedFields: 'joinPassword',
          passwordUpdated: true,
          nameBefore: before?.name ?? null,
          nameAfter: after?.name ?? null,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Join password updated successfully' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to update password'), 400);
    }
  },

  updateAvatar: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return formError('Rosters are locked', 400);
    }

    const formData = await request.formData();
    const avatar = formData.get('avatar');

    if (!(avatar instanceof File) || avatar.size === 0) {
      return formError('No file uploaded', 400);
    }

    try {
      const before = await getTeamAuditSnapshot(teamId);
      const avatarUrl = await uploadTeamAvatar(teamId, avatar);

      if (!avatarUrl) {
        return formError('R2 storage not configured. Avatar upload disabled.', 400);
      }

      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_AVATAR_CHANGED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          changedFields: 'avatar',
          avatarBefore: before?.avatar ?? null,
          avatarAfter: after?.avatar ?? avatarUrl,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Avatar updated successfully', avatarUrl };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to upload avatar'), 400);
    }
  },

  promotePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await promotePlayer(teamId, validation.data.playerSteamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_PROMOTED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId: validation.data.playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player promoted successfully' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to promote player'), 400);
    }
  },

  demotePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await demotePlayer(teamId, validation.data.playerSteamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_DEMOTED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId: validation.data.playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player demoted successfully' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to demote player'), 400);
    }
  },

  invitePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return formError('Rosters are locked', 400);
    }

    const formData = await request.formData();
    const validation = validateForm(formData, invitePlayerSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await invitePlayerBySteamId(teamId, validation.data.steamId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_INVITED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { invitedSteamId: validation.data.steamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player invited successfully' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to invite player'), 400);
    }
  },

  cancelInvite: async ({ request, params, locals }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const validation = validateForm(formData, playerSteamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await declineInvitation(validation.data.playerSteamId, teamId);
      return { success: true, message: 'Invitation cancelled' };
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to cancel invitation'), 400);
    }
  },

  disbandTeam: async ({ params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);

    const { isOwner } = await getTeamForEdit(teamId, locals.user.steamId);
    const isGlobalAdmin = isAdmin(locals.user);

    if (!isOwner && !isGlobalAdmin) {
      return formError('Only the team owner or an admin can disband the team', 403);
    }

    const before = await getTeamAuditSnapshot(teamId);
    await disbandTeam(teamId);
    const after = await getTeamAuditSnapshot(teamId);

    await logAudit({
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      category: AuditCategory.TEAM,
      action: AuditAction.TEAM_DISBANDED,
      targetType: 'Team',
      targetId: String(teamId),
      metadata: {
        nameBefore: before?.name ?? null,
        statusBefore: before?.status ?? null,
        statusAfter: after?.status ?? null,
        seasonIdBefore: before?.seasonId ?? null,
        divisionIdBefore: before?.divisionId ?? null,
        divisionNameBefore: before?.divisionName ?? null,
        regionIdBefore: before?.regionId ?? null,
        regionNameBefore: before?.regionName ?? null,
      },
      ipAddress: getClientAddress(),
    });

    throw redirect(303, `/teams/${teamId}?disbanded=1`);
  },
};
