import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { 
	getAnnouncements, 
	createAnnouncement, 
	updateAnnouncement, 
	toggleAnnouncementVisibility, 
	deleteAnnouncement 
} from '$lib/server/services/announcements';
import { 
	getGlobalSettings, 
	toggleRosterLocked, 
	toggleSignupClosed, 
	togglePaymentRequired, 
	updateGlobalSettings 
} from '$lib/server/services/settings';
import { getRegions } from '$lib/server/services/regions';
import { getSeasons } from '$lib/server/services/seasons';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	
	const [announcements, globalSettings, regions, seasons] = await Promise.all([
		getAnnouncements(),
		getGlobalSettings(),
		getRegions(),
		getSeasons()
	]);
	
	// Group seasons by region for easier selection
	const seasonsByRegion = seasons.reduce((acc, season) => {
		const regionName = season.region.name;
		if (!acc[regionName]) {
			acc[regionName] = [];
		}
		acc[regionName].push(season);
		return acc;
	}, {} as Record<string, typeof seasons>);
	
	return {
		announcements,
		globalSettings,
		regions,
		seasonsByRegion
	};
};

export const actions: Actions = {
	createAnnouncement: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const content = formData.get('content')?.toString().trim();
		
		if (!content) {
			return fail(400, { error: 'Announcement content is required' });
		}
		
		if (content.length > 500) {
			return fail(400, { error: 'Announcement content must be less than 500 characters' });
		}
		
		try {
			await createAnnouncement(content);
			return { success: true, message: 'Announcement created successfully' };
		} catch (error) {
			console.error('Error creating announcement:', error);
			return fail(500, { error: 'Failed to create announcement' });
		}
	},
	
	editAnnouncement: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() || '');
		const content = formData.get('content')?.toString().trim();
		
		if (!id || isNaN(id)) {
			return fail(400, { error: 'Invalid announcement ID' });
		}
		
		if (!content) {
			return fail(400, { error: 'Announcement content is required' });
		}
		
		if (content.length > 500) {
			return fail(400, { error: 'Announcement content must be less than 500 characters' });
		}
		
		try {
			await updateAnnouncement(id, content);
			return { success: true, message: 'Announcement updated successfully' };
		} catch (error) {
			console.error('Error updating announcement:', error);
			return fail(500, { error: 'Failed to update announcement' });
		}
	},
	
	toggleVisibility: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() || '');
		const visible = formData.get('visible') === '1';
		
		if (!id || isNaN(id)) {
			return fail(400, { error: 'Invalid announcement ID' });
		}
		
		try {
			await toggleAnnouncementVisibility(id, visible);
			return { success: true, message: `Announcement ${visible ? 'shown' : 'hidden'} successfully` };
		} catch (error) {
			console.error('Error toggling announcement visibility:', error);
			return fail(500, { error: 'Failed to toggle announcement visibility' });
		}
	},
	
	deleteAnnouncement: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() || '');
		
		if (!id || isNaN(id)) {
			return fail(400, { error: 'Invalid announcement ID' });
		}
		
		try {
			await deleteAnnouncement(id);
			return { success: true, message: 'Announcement deleted successfully' };
		} catch (error) {
			console.error('Error deleting announcement:', error);
			return fail(500, { error: 'Failed to delete announcement' });
		}
	},
	
	toggleRoster: async ({ locals }) => {
		requireAdmin(locals.user);
		
		try {
			await toggleRosterLocked();
			return { success: true, message: 'Roster lock status updated' };
		} catch (error) {
			console.error('Error toggling roster lock:', error);
			return fail(500, { error: 'Failed to update roster lock' });
		}
	},
	
	toggleSignup: async ({ locals }) => {
		requireAdmin(locals.user);
		
		try {
			await toggleSignupClosed();
			return { success: true, message: 'Signup lock status updated' };
		} catch (error) {
			console.error('Error toggling signup lock:', error);
			return fail(500, { error: 'Failed to update signup lock' });
		}
	},
	
	togglePayment: async ({ locals }) => {
		requireAdmin(locals.user);
		
		try {
			await togglePaymentRequired();
			return { success: true, message: 'Payment requirement updated' };
		} catch (error) {
			console.error('Error toggling payment requirement:', error);
			return fail(500, { error: 'Failed to update payment requirement' });
		}
	},
	
	updateFees: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const fees = parseInt(formData.get('fees')?.toString() || '0');
		
		if (isNaN(fees) || fees < 0) {
			return fail(400, { error: 'Invalid fee amount' });
		}
		
		try {
			await updateGlobalSettings({ leagueFees: fees });
			return { success: true, message: 'League fees updated' };
		} catch (error) {
			console.error('Error updating league fees:', error);
			return fail(500, { error: 'Failed to update league fees' });
		}
	},
	
	updateSeasonAssignments: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		
		const updates: any = {};
		const regions = ['NA', 'EU', 'AUS', 'SA', 'ASIA'] as const;
		
		for (const region of regions) {
			const fieldName = `${region.toLowerCase()}SignupSeasonId`;
			const value = formData.get(fieldName)?.toString();
			const seasonId = value ? parseInt(value) : null;
			
			if (value && isNaN(seasonId as number)) {
				return fail(400, { error: `Invalid season ID for ${region}` });
			}
			
			updates[fieldName] = seasonId;
		}
		
		try {
			await updateGlobalSettings(updates);
			return { success: true, message: 'Season assignments updated' };
		} catch (error) {
			console.error('Error updating season assignments:', error);
			return fail(500, { error: 'Failed to update season assignments' });
		}
	},
	
	updateMatchDeadline: async ({ request, locals }) => {
		requireAdmin(locals.user);
		
		const formData = await request.formData();
		const weekNumber = formData.get('weekNumber')?.toString();
		const deadline = formData.get('deadline')?.toString();
		
		const updates: any = {};
		
		// Parse week number (can be empty to clear)
		if (weekNumber) {
			const week = parseInt(weekNumber);
			if (isNaN(week) || week < 1) {
				return fail(400, { error: 'Invalid week number' });
			}
			updates.currentMatchWeek = week;
		} else {
			updates.currentMatchWeek = null;
		}
		
		// Parse deadline (can be empty to clear)
		if (deadline) {
			const deadlineDate = new Date(deadline);
			if (isNaN(deadlineDate.getTime())) {
				return fail(400, { error: 'Invalid deadline date' });
			}
			updates.matchCreationDeadline = deadlineDate;
		} else {
			updates.matchCreationDeadline = null;
		}
		
		try {
			await updateGlobalSettings(updates);
			return { success: true, message: 'Match creation deadline updated' };
		} catch (error) {
			console.error('Error updating match deadline:', error);
			return fail(500, { error: 'Failed to update match deadline' });
		}
	}
};

