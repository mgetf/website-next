import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireTeamAdmin, isAdmin } from '$lib/server/auth/permissions';
import {
	getTeamForEdit,
	updateTeamInfo,
	uploadTeamAvatar,
	removePlayer,
	promotePlayer,
	demotePlayer,
	invitePlayerBySteamId,
	approvePlayer,
	declinePlayer,
	disbandTeam
} from '$lib/server/services/teamManagement';
import { generateJoinToken } from '$lib/server/services/teamSignup';
import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { FORMAT_1V1 } from '$lib/server/constants/formats';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireAuth(locals.user);

	const teamId = parseInt(params.id);
	if (isNaN(teamId)) {
		throw redirect(303, '/');
	}

	// Check if this is a 1v1 team - redirect to player profile if so
	// 1v1 entries cannot be edited (name/avatar are frozen)
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		select: {
			formatId: true,
			players: {
				where: { active: 1 },
				select: { playerSteamId: true }
			}
		}
	});

	if (team?.formatId === FORMAT_1V1) {
		const activePlayer = team.players[0];
		if (activePlayer) {
			throw redirect(301, `/users/${activePlayer.playerSteamId}`);
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
		isGlobalAdmin
	};
};

export const actions: Actions = {
	updateInfo: async ({ request, params, locals }) => {
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
			await updateTeamInfo(teamId, { name, acronym });
			return { success: true, message: 'Team info updated successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to update team info' });
		}
	},

	updatePassword: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
		if (rosterLocked) {
			return fail(400, { error: 'Rosters are locked' });
		}

		const formData = await request.formData();
		const joinPassword = formData.get('joinPassword') as string;

		if (!joinPassword) {
			return fail(400, { error: 'Password is required' });
		}

		try {
			await updateTeamInfo(teamId, { joinPassword });
			return { success: true, message: 'Join password updated successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to update password' });
		}
	},

	updateAvatar: async ({ request, params, locals }) => {
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
			const avatarUrl = await uploadTeamAvatar(teamId, avatar);
			
			if (!avatarUrl) {
				return fail(400, { error: 'R2 storage not configured. Avatar upload disabled.' });
			}
			
			return { success: true, message: 'Avatar updated successfully', avatarUrl };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to upload avatar' });
		}
	},

	removePlayer: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const { rosterLocked, isAdmin: isTeamAdmin } = await getTeamForEdit(teamId, locals.user.steamId);
		const { isAdmin } = await import('$lib/server/auth/permissions');
		const isGlobalAdmin = isAdmin(locals.user);
		
		// Global admins can bypass roster lock
		if (rosterLocked && !isGlobalAdmin) {
			return fail(400, { error: 'Rosters are locked' });
		}

		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId') as string;

		try {
			await removePlayer(teamId, playerSteamId);
			return { success: true, message: 'Player removed successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to remove player' });
		}
	},

	promotePlayer: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId') as string;

		try {
			await promotePlayer(teamId, playerSteamId);
			return { success: true, message: 'Player promoted successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to promote player' });
		}
	},

	demotePlayer: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId') as string;

		try {
			await demotePlayer(teamId, playerSteamId);
			return { success: true, message: 'Player demoted successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to demote player' });
		}
	},

	invitePlayer: async ({ request, params, locals }) => {
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
			await invitePlayerBySteamId(teamId, steamId);
			return { success: true, message: 'Player invited successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to invite player' });
		}
	},

	approvePlayer: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
		if (rosterLocked) {
			return fail(400, { error: 'Rosters are locked' });
		}

		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId') as string;

		try {
			await approvePlayer(teamId, playerSteamId);
			return { success: true, message: 'Player approved successfully' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to approve player' });
		}
	},

	declinePlayer: async ({ request, params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		await requireTeamAdmin(locals.user, teamId);

		const { rosterLocked } = await getTeamForEdit(teamId, locals.user.steamId);
		if (rosterLocked) {
			return fail(400, { error: 'Rosters are locked' });
		}

		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId') as string;

		try {
			await declinePlayer(teamId, playerSteamId);
			return { success: true, message: 'Player invitation declined' };
		} catch (err: any) {
			return fail(400, { error: err.body?.message || 'Failed to decline player' });
		}
	},

	disbandTeam: async ({ params, locals }) => {
		requireAuth(locals.user);
		const teamId = parseInt(params.id);
		
		// Must be owner OR global admin
		const { isOwner } = await getTeamForEdit(teamId, locals.user.steamId);
		const { isAdmin } = await import('$lib/server/auth/permissions');
		const isGlobalAdmin = isAdmin(locals.user);
		
		if (!isOwner && !isGlobalAdmin) {
			return fail(403, { error: 'Only the team owner or an admin can disband the team' });
		}

		await disbandTeam(teamId);
		
		// Redirect to the team's main page after disbanding
		throw redirect(303, `/teams/${teamId}`);
	}
};

