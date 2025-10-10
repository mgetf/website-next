import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { requestJoinByPassword } from '$lib/server/services/teamJoin';
import { prisma } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireAuth(locals.user);

	const teamId = parseInt(params.id);
	if (isNaN(teamId)) {
		throw redirect(303, '/');
	}

	// Load team info
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: {
			division: true,
			region: true,
			season: true
		}
	});

	if (!team) {
		throw redirect(303, '/');
	}

	// Check if team is 1v1
	if (team.is1v1 === 1) {
		return {
			team,
			error: 'Cannot join 1v1 teams',
			canJoin: false,
			rosterLocked: false
		};
	}

	// Check if rosters are locked
	const global = await prisma.global.findFirst();
	const rosterLocked = global?.rosterLocked === 1;

	// Check if user is trying to join their own team
	const isTeamMember = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: locals.user.steamId,
			teamId,
			active: 1,
			permissionLevel: {
				gte: 0
			}
		}
	});

	if (isTeamMember) {
		return {
			team,
			error: 'You cannot invite yourself to your own team',
			canJoin: false,
			rosterLocked
		};
	}

	// Check if user is already in another 2v2 team
	const playerInOtherTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: locals.user.steamId,
			active: 1,
			team: {
				is1v1: 0
			}
		}
	});

	if (playerInOtherTeam) {
		return {
			team,
			error: 'You are already in another 2v2 team',
			canJoin: false,
			rosterLocked
		};
	}

	return {
		team,
		error: null,
		canJoin: !rosterLocked,
		rosterLocked
	};
};

export const actions: Actions = {
	joinTeam: async ({ request, params, locals }) => {
		requireAuth(locals.user);

		const teamId = parseInt(params.id);
		if (isNaN(teamId)) {
			return fail(400, { error: 'Invalid team ID' });
		}

		// Check if rosters are locked
		const global = await prisma.global.findFirst();
		if (global?.rosterLocked === 1) {
			return fail(400, { error: 'Rosters are currently locked' });
		}

		const formData = await request.formData();
		const password = formData.get('password') as string;

		if (!password) {
			return fail(400, { error: 'Password is required' });
		}

		try {
			await requestJoinByPassword(teamId, locals.user.steamId, password);
			
			// Redirect to team page with success message
			throw redirect(303, `/teams/${teamId}?joined=pending`);
		} catch (err: any) {
			if (err.status === 303) {
				throw err;
			}
			return fail(400, { error: err.body?.message || 'Failed to join team' });
		}
	}
};


