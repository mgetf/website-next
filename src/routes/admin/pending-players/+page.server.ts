/**
 * Admin Pending Players Page - Server Load and Actions
 * Allows admins/moderators to approve or decline player join requests
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getPendingPlayers, approvePlayer, declinePlayer } from '$lib/server/services/pendingPlayers';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user); // Moderators and admins can manage
	
	const pendingPlayers = await getPendingPlayers();
	
	return {
		pendingPlayers
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId')?.toString();
		const teamId = parseInt(formData.get('teamId')?.toString() || '');
		
		if (!playerSteamId || !teamId || isNaN(teamId)) {
			return fail(400, { error: 'Invalid parameters' });
		}
		
		try {
			await approvePlayer(playerSteamId, teamId);
			return { success: true, message: 'Player approved successfully' };
		} catch (error) {
			console.error('Error approving player:', error);
			return fail(500, { error: 'Failed to approve player' });
		}
	},
	
	decline: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const playerSteamId = formData.get('playerSteamId')?.toString();
		const teamId = parseInt(formData.get('teamId')?.toString() || '');
		const reason = formData.get('reason')?.toString() || '';
		
		if (!playerSteamId || !teamId || isNaN(teamId)) {
			return fail(400, { error: 'Invalid parameters' });
		}
		
		if (!reason || reason.trim().length === 0) {
			return fail(400, { error: 'Decline reason is required' });
		}
		
		try {
			await declinePlayer(playerSteamId, teamId, reason, locals.user.steamId);
			return { success: true, message: 'Player declined successfully' };
		} catch (error) {
			console.error('Error declining player:', error);
			return fail(500, { error: 'Failed to decline player' });
		}
	}
};

