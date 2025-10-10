import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { validateTokenAndGetTeam, acceptInviteByToken } from '$lib/server/services/teamJoin';
import { prisma } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
	requireAuth(locals.user);

	const token = url.searchParams.get('token');

	if (!token) {
		throw redirect(303, '/');
	}

	try {
		const teamInfo = await validateTokenAndGetTeam(token, locals.user.steamId);

		// Check if rosters are locked
		const global = await prisma.global.findFirst();
		const rosterLocked = global?.rosterLocked === 1;

		return {
			...teamInfo,
			token,
			rosterLocked
		};
	} catch (err: any) {
		return {
			error: err.body?.message || 'Invalid or expired invitation link',
			team: null,
			activePlayers: [],
			canJoin: false,
			token: null,
			rosterLocked: false
		};
	}
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		requireAuth(locals.user);

		const formData = await request.formData();
		const token = formData.get('token') as string;

		if (!token) {
			return fail(400, { error: 'Invalid token' });
		}

		// Check if rosters are locked
		const global = await prisma.global.findFirst();
		if (global?.rosterLocked === 1) {
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
		const token = formData.get('token') as string;

		if (!token) {
			return fail(400, { error: 'Invalid token' });
		}

		try {
			// Just decode to get team ID, then delete pending
			const { validateJoinToken } = await import('$lib/server/services/teamSignup');
			const { teamId } = validateJoinToken(token);

			await prisma.pendingPlayer.deleteMany({
				where: {
					playerSteamId: locals.user.steamId,
					teamId
				}
			});

			throw redirect(303, '/');
		} catch (err: any) {
			if (err.status === 303) {
				throw err;
			}
			return fail(400, { error: err.body?.message || 'Failed to decline invitation' });
		}
	}
};


