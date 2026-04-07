import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireNotBanned, isBanned } from '$lib/server/auth/permissions';
import {
  joinByPassword,
  isPlayerInTeam,
  isPlayerInAnyActiveTeam,
  hasAnyPendingRequest,
} from '$lib/server/services/teamJoin';
import { getTeamById } from '$lib/server/services/teams';
import { isSeasonCurrentlyActive, getEffectiveRosterLock } from '$lib/server/services/settings';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { createNotificationForTeam } from '$lib/server/services/notifications';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const joinTeamSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

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

  if (team.status === 'DEAD') {
    return {
      team,
      error: 'This team has been disbanded.',
      canJoin: false,
      rosterLocked: false,
    };
  }

  const seasonActive = team.season ? await isSeasonCurrentlyActive(team.season.id) : false;

  if (!seasonActive) {
    return {
      team,
      error: "This team's season has ended. Joining is no longer available.",
      canJoin: false,
      rosterLocked: false,
    };
  }

  if (isBanned(locals.user)) {
    return {
      team,
      error: 'Your account is suspended or banned',
      canJoin: false,
      rosterLocked: false,
    };
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

  const rosterLocked = team.season?.rosterLocked
    ? await isSeasonCurrentlyActive(team.season.id)
    : false;

  const activePlayerCount = team.players.filter((p) => p.active === 1).length;
  if (activePlayerCount >= 3) {
    return {
      team,
      error: 'Team is full (maximum 3 players)',
      canJoin: false,
      rosterLocked,
    };
  }

  const isTeamMemberCheck = await isPlayerInTeam(locals.user.steamId, teamId);

  if (isTeamMemberCheck) {
    return {
      team,
      error: 'You cannot invite yourself to your own team',
      canJoin: false,
      rosterLocked,
    };
  }

  const playerInOtherTeam = await isPlayerInAnyActiveTeam(locals.user.steamId);

  if (playerInOtherTeam) {
    return {
      team,
      error: 'You are already in another 2v2 team',
      canJoin: false,
      rosterLocked,
    };
  }

  const hasPending = await hasAnyPendingRequest(locals.user.steamId);

  if (hasPending) {
    return {
      team,
      error:
        'You already have a pending join request. Please wait for it to be resolved before requesting to join another team.',
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
    requireNotBanned(locals.user);

    const teamId = parseInt(params.id);
    if (isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return fail(404, { error: 'Team not found' });
    }

    const seasonActive = team.season ? await isSeasonCurrentlyActive(team.season.id) : false;
    if (!seasonActive) {
      return fail(400, { error: "This team's season has ended. Joining is no longer available." });
    }

    const rosterLocked = await getEffectiveRosterLock(teamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are currently locked' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, joinTeamSchema);
    if (!validation.success) return validationError(validation.errors);

    const { password } = validation.data;

    try {
      await joinByPassword(teamId, locals.user.steamId, password);

      await createNotificationForTeam(
        teamId,
        `${locals.user.steamUsername} has requested to join your team (pending admin approval)`,
        locals.user.steamId,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.ROSTER,
        action: AuditAction.PLAYER_JOINED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { method: 'password', status: 'awaiting-admin' },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/teams/${teamId}?joined=awaiting-admin`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, { error: getErrorMessage(err, 'Failed to join team') });
    }
  },
};
