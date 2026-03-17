import type { PageServerLoad, Actions } from './$types';
import {
  requireAuth,
  requireTeamAdmin,
  isAdmin,
} from '$lib/server/auth/permissions';
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
import { declineInvitation } from '$lib/server/services/teamJoin';
import { generateJoinToken } from '$lib/server/services/teamSignup';
import { fail, redirect } from '@sveltejs/kit';
import { getTeamFormatCheck, getTeamAuditSnapshot } from '$lib/server/services/teams';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const teamId = parseInt(params.id);
  if (isNaN(teamId)) {
    throw redirect(303, '/');
  }

  const team = await getTeamFormatCheck(teamId);

  if (team?.formatId === FORMAT_1V1) {
    // Find active player first, fall back to any player
    const player = team.players.find((p) => p.active === 1) || team.players[0];
    if (player) {
      throw redirect(301, `/users/${player.playerSteamId}`);
    }
    throw redirect(301, '/');
  }

  // Check team admin permission
  await requireTeamAdmin(locals.user, teamId);

  // Load team data
  const teamData = await getTeamForEdit(teamId, locals.user.steamId);

  // Check if user is global admin
  const isGlobalAdmin = isAdmin(locals.user);

  // Generate invite token
  const inviteToken = generateJoinToken(teamId, locals.user.steamId);
  const inviteUrl = `/teams/join?token=${inviteToken}`;

  return {
    ...teamData,
    inviteUrl,
    currentUserSteamId: locals.user.steamId,
    isGlobalAdmin,
  };
};

export const actions: Actions = {
  updateInfo: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are locked' });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const acronym = formData.get('acronym') as string;

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
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
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
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to update team info',
      });
    }
  },

  updatePassword: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are locked' });
    }

    const formData = await request.formData();
    const joinPassword = (formData.get('joinPassword') as string)?.trim();

    if (!joinPassword) {
      return { success: true, message: 'No changes made' };
    }

    try {
      const before = await getTeamAuditSnapshot(teamId);
      await updateTeamInfo(teamId, { joinPassword });
      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
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
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to update password',
      });
    }
  },

  updateAvatar: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are locked' });
    }

    const formData = await request.formData();
    const avatar = formData.get('avatar') as File;

    if (!avatar || avatar.size === 0) {
      return fail(400, { error: 'No file uploaded' });
    }

    try {
      const before = await getTeamAuditSnapshot(teamId);
      const avatarUrl = await uploadTeamAvatar(teamId, avatar);

      if (!avatarUrl) {
        return fail(400, {
          error: 'R2 storage not configured. Avatar upload disabled.',
        });
      }

      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
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

      return {
        success: true,
        message: 'Avatar updated successfully',
        avatarUrl,
      };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to upload avatar',
      });
    }
  },

  removePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    const { isAdmin: isAdminFn } = await import('$lib/server/auth/permissions');
    const isGlobalAdmin = isAdminFn(locals.user);

    if (rosterLocked && !isGlobalAdmin) {
      return fail(400, { error: 'Rosters are locked' });
    }

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    try {
      await removePlayer(teamId, playerSteamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_REMOVED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player removed successfully' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to remove player',
      });
    }
  },

  promotePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    try {
      await promotePlayer(teamId, playerSteamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_PROMOTED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player promoted successfully' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to promote player',
      });
    }
  },

  demotePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    try {
      await demotePlayer(teamId, playerSteamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_DEMOTED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { playerSteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player demoted successfully' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to demote player',
      });
    }
  },

  invitePlayer: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are locked' });
    }

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;

    if (!steamId) {
      return fail(400, { error: 'Steam ID is required' });
    }

    try {
      await invitePlayerBySteamId(teamId, steamId, locals.user.steamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_INVITED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { invitedSteamId: steamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player invited successfully' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to invite player',
      });
    }
  },

  cancelInvite: async ({ request, params, locals }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);
    await requireTeamAdmin(locals.user, teamId);

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId') as string;

    try {
      await declineInvitation(playerSteamId, teamId);
      return { success: true, message: 'Invitation cancelled' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to cancel invitation',
      });
    }
  },

  disbandTeam: async ({ params, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const teamId = parseInt(params.id);

    const { isOwner } = await getTeamForEdit(teamId, locals.user.steamId);
    const { isAdmin: isAdminFn } = await import('$lib/server/auth/permissions');
    const isGlobalAdmin = isAdminFn(locals.user);

    if (!isOwner && !isGlobalAdmin) {
      return fail(403, {
        error: 'Only the team owner or an admin can disband the team',
      });
    }

    const before = await getTeamAuditSnapshot(teamId);
    await disbandTeam(teamId);
    const after = await getTeamAuditSnapshot(teamId);

    await logAudit({
      actorId: locals.user?.steamId,
      actorRole: locals.user?.permissionLevel,
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
