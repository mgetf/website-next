import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getUserPendingInvites, acceptInviteByToken, declineInvitation } from '$lib/server/services/teamJoin';
import { generateJoinToken } from '$lib/server/services/teamSignup';
import { getSeasonSettingsByTeamId } from '$lib/server/services/settings';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	// Get pending invites
	const pendingInvites = await getUserPendingInvites(locals.user.steamId);

	// Generate tokens and check roster lock for each invite
	const invitesWithTokens = await Promise.all(pendingInvites.map(async (invite) => {
		const seasonSettings = await getSeasonSettingsByTeamId(invite.teamId);
		return {
			...invite,
			token: generateJoinToken(invite.teamId),
			rosterLocked: seasonSettings?.rosterLocked ?? false
		};
	}));

	// Check if ANY invite has rosters unlocked (for global display)
	const anyRosterLocked = invitesWithTokens.some(inv => inv.rosterLocked);

	return {
		invitations: invitesWithTokens,
		rosterLocked: anyRosterLocked
	};
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		requireAuth(locals.user);

		const formData = await request.formData();
		const token = formData.get('token') as string;

		if (!token) {
			return fail(400, { error: 'Invalid token' });
		}

		// Get team ID from token to check season settings
		const { validateJoinToken: decodeToken } = await import('$lib/server/services/teamSignup');
		const { teamId } = decodeToken(token);
		
		// Check if rosters are locked for this team's season
		const seasonSettings = await getSeasonSettingsByTeamId(teamId);
		if (seasonSettings?.rosterLocked) {
			return fail(400, { error: 'Rosters are currently locked' });
		}

		try {
			const teamId = await acceptInviteByToken(token, locals.user.steamId);
			throw redirect(303, `/teams/${teamId}`);
		} catch (err: any) {
			if (err.status === 303) {
				throw err;
			}
			return fail(400, { error: err.body?.message || 'Failed to accept invitation' });
		}
	},

	decline: async ({ request, locals }) => {
		requireAuth(locals.user);

		const formData = await request.formData();
		const teamId = parseInt(formData.get('teamId') as string);

		if (isNaN(teamId)) {
			return fail(400, { error: 'Invalid team ID' });
		}

		try {
			await declineInvitation(locals.user.steamId, teamId);

			return { success: true, message: 'Invitation declined' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to decline invitation' });
		}
	}
};


