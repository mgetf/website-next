import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { 
	getAnnouncements, 
	createAnnouncement, 
	updateAnnouncement, 
	toggleAnnouncementVisibility, 
	deleteAnnouncement 
} from '$lib/server/services/announcements';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	
	const announcements = await getAnnouncements();
	
	return {
		announcements
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
	}
};

