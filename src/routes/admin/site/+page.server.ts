/**
 * Admin Site Settings - Server Logic
 * Manage site content and settings
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getSiteSettings,
  updateSiteSettings,
  updateFavicon,
} from '$lib/server/services/siteSettings';
import {
  getAllContent,
  upsertContent,
  getContent,
  CONTENT_KEYS,
  getDefaultContent,
} from '$lib/server/services/siteContent';
import {
  uploadToR2,
  saveTempFile,
  deleteTempFile,
  validateUploadedFile,
  isR2Available,
} from '$lib/server/utils/r2Upload';
import { fail } from '@sveltejs/kit';
import { UserRole } from '$lib/types/user';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [settings, allContent] = await Promise.all([
    getSiteSettings(),
    getAllContent(),
  ]);

  // Build content map with defaults for missing keys
  const contentMap: Record<string, string> = {};
  for (const item of allContent) {
    contentMap[item.key] = item.content;
  }

  // Ensure all expected keys have content (use defaults if missing)
  for (const key of Object.values(CONTENT_KEYS)) {
    if (!contentMap[key]) {
      contentMap[key] = getDefaultContent(key);
    }
  }

  // Get rulebook content specifically
  const rulebookContent = await getContent(CONTENT_KEYS.RULEBOOK);

  return {
    settings,
    content: contentMap,
    rulebookContent:
      rulebookContent || getDefaultContent(CONTENT_KEYS.RULEBOOK),
    isHeadAdmin: locals.user.permissionLevel === UserRole.ADMIN,
    isR2Available: isR2Available(),
  };
};

export const actions: Actions = {
  updateSettings: async ({ request, locals }) => {
    requireAdmin(locals.user);

    // Only head admins can update site settings
    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can update site settings' });
    }

    const formData = await request.formData();
    const siteTitle = formData.get('siteTitle')?.toString();

    if (!siteTitle || siteTitle.trim().length === 0) {
      return fail(400, { error: 'Site title is required' });
    }

    try {
      await updateSiteSettings({ siteTitle: siteTitle.trim() });
      return { success: true, message: 'Site settings updated' };
    } catch (error) {
      console.error('Error updating site settings:', error);
      return fail(500, { error: 'Failed to update settings' });
    }
  },

  updateHomepageContent: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const subtitle = formData.get('subtitle')?.toString() || '';
    const about = formData.get('about')?.toString() || '';

    try {
      await Promise.all([
        upsertContent(
          CONTENT_KEYS.HOMEPAGE_SUBTITLE,
          subtitle,
          locals.user.steamId,
        ),
        upsertContent(CONTENT_KEYS.HOMEPAGE_ABOUT, about, locals.user.steamId),
      ]);
      return { success: true, message: 'Homepage content updated' };
    } catch (error) {
      console.error('Error updating homepage content:', error);
      return fail(500, { error: 'Failed to update content' });
    }
  },

  updateRulebook: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const content = formData.get('content')?.toString() || '';

    if (!content.trim()) {
      return fail(400, { error: 'Rulebook content cannot be empty' });
    }

    try {
      await upsertContent(CONTENT_KEYS.RULEBOOK, content, locals.user.steamId);
      return { success: true, message: 'Rulebook updated' };
    } catch (error) {
      console.error('Error updating rulebook:', error);
      return fail(500, { error: 'Failed to update rulebook' });
    }
  },

  uploadFavicon: async ({ request, locals }) => {
    requireAdmin(locals.user);

    // Only head admins can update site settings
    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can update favicon' });
    }

    if (!isR2Available()) {
      return fail(400, { error: 'File storage is not configured' });
    }

    const formData = await request.formData();
    const file = formData.get('favicon') as File | null;

    if (!file || file.size === 0) {
      return fail(400, { error: 'No file provided' });
    }

    // Validate file (image types, max 1MB for favicon)
    try {
      validateUploadedFile(file, 'image');
      if (file.size > 1024 * 1024) {
        return fail(400, { error: 'Favicon must be less than 1MB' });
      }
    } catch (e: any) {
      return fail(400, { error: e.body?.message || 'Invalid file' });
    }

    let tempPath: string | null = null;
    try {
      // Save temp file
      tempPath = await saveTempFile(file);

      // Upload to R2
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const remotePath = `site/favicon-${Date.now()}.${ext}`;
      const publicUrl = await uploadToR2(tempPath, remotePath);

      if (!publicUrl) {
        return fail(500, { error: 'Failed to upload favicon' });
      }

      // Update site settings
      await updateFavicon(publicUrl);

      return { success: true, message: 'Favicon updated successfully' };
    } catch (error) {
      console.error('Error uploading favicon:', error);
      return fail(500, { error: 'Failed to upload favicon' });
    } finally {
      // Cleanup temp file
      if (tempPath) {
        deleteTempFile(tempPath);
      }
    }
  },
};
