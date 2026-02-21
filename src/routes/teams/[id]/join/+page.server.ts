import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import {
  requestJoinByPassword,
  isPlayerInTeam,
  isPlayerInAnyActiveTeam,
} from '$lib/server/services/teamJoin';
import { getTeamById } from '$lib/server/services/teams';
import { getSeasonSettingsByTeamId } from '$lib/server/services/settings';
import { fail, redirect } from '@sveltejs/kit';
import { createNotificationForTeam } from '$lib/server/services/notifications';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const teamId = parseInt(params.id);
  if (isNaN(teamId)) {
    throw redirect(303, '/');
  }

  // Load team info
  const team = await getTeamById(teamId);

  if (!team) {
    throw redirect(303, '/');
  }

  // Check if team is 1v1
  if (team.formatId === FORMAT_1V1) {
    return {
      team,
      error: 'Cannot join 1v1 teams',
      canJoin: false,
      rosterLocked: false,
    };
  }

  // Check if rosters are locked for this team's season
  const rosterLocked = team.season?.rosterLocked ?? false;

  // Check if user is trying to join their own team
  const isTeamMemberCheck = await isPlayerInTeam(locals.user.steamId, teamId);

  if (isTeamMemberCheck) {
    return {
      team,
      error: 'You cannot invite yourself to your own team',
      canJoin: false,
      rosterLocked,
    };
  }

  // Check if user is already in another 2v2 team
  const playerInOtherTeam = await isPlayerInAnyActiveTeam(locals.user.steamId);

  if (playerInOtherTeam) {
    return {
      team,
      error: 'You are already in another 2v2 team',
      canJoin: false,
      rosterLocked,
    };
  }

  return {
    team,
    error: null,
    canJoin: !rosterLocked,
    rosterLocked,
  };
};

export const actions: Actions = {
  joinTeam: async ({ request, params, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const teamId = parseInt(params.id);
    if (isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    // Check if rosters are locked for this team's season
    const seasonSettings = await getSeasonSettingsByTeamId(teamId);
    if (seasonSettings?.rosterLocked) {
      return fail(400, { error: 'Rosters are currently locked' });
    }

    const formData = await request.formData();
    const password = formData.get('password') as string;

    if (!password) {
      return fail(400, { error: 'Password is required' });
    }

    try {
      await requestJoinByPassword(teamId, locals.user.steamId, password);

      await createNotificationForTeam(
        teamId,
        `${locals.user.steamUsername} wants to join your team`,
        locals.user.steamId,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_JOINED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { status: 'pending' },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/teams/${teamId}?joined=pending`);
    } catch (err: any) {
      if (err.status === 303) {
        throw err;
      }
      return fail(400, { error: err.body?.message || 'Failed to join team' });
    }
  },
};
