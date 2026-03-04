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
  updateBackgroundImage,
  updateBackgroundSettings,
  removeBackgroundImage,
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
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import {
  createApiKey,
  getApiKeys,
  toggleApiKey,
  deleteApiKey,
} from '$lib/server/services/apiKeys';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [settings, allContent, apiKeys] = await Promise.all([
    getSiteSettings(),
    getAllContent(),
    getApiKeys(),
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
    apiKeys,
  };
};

export const actions: Actions = {
  updateSettings: async ({ request, locals, getClientAddress }) => {
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
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.SITE, action: AuditAction.SITE_SETTINGS_UPDATED, metadata: { siteTitle: siteTitle.trim() }, ipAddress: getClientAddress() });
      return { success: true, message: 'Site settings updated' };
    } catch (error) {
      console.error('Error updating site settings:', error);
      return fail(500, { error: 'Failed to update settings' });
    }
  },

  updateHomepageContent: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const subtitle = formData.get('subtitle')?.toString() || '';
    const about = formData.get('about')?.toString() || '';

    try {
      await Promise.all([
        upsertContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE, subtitle, locals.user.steamId),
        upsertContent(CONTENT_KEYS.HOMEPAGE_ABOUT, about, locals.user.steamId),
      ]);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.SITE, action: AuditAction.CONTENT_UPDATED, metadata: { keys: ['homepage_subtitle', 'homepage_about'] }, ipAddress: getClientAddress() });
      return { success: true, message: 'Homepage content updated' };
    } catch (error) {
      console.error('Error updating homepage content:', error);
      return fail(500, { error: 'Failed to update content' });
    }
  },

  updateRulebook: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const content = formData.get('content')?.toString() || '';

    if (!content.trim()) {
      return fail(400, { error: 'Rulebook content cannot be empty' });
    }

    try {
      await upsertContent(CONTENT_KEYS.RULEBOOK, content, locals.user.steamId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.SITE, action: AuditAction.CONTENT_UPDATED, metadata: { key: 'rulebook' }, ipAddress: getClientAddress() });
      return { success: true, message: 'Rulebook updated' };
    } catch (error) {
      console.error('Error updating rulebook:', error);
      return fail(500, { error: 'Failed to update rulebook' });
    }
  },

  updateBackground: async ({ request, locals }) => {
    requireAdmin(locals.user);

    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can update the background image' });
    }

    if (!isR2Available()) {
      return fail(400, { error: 'File storage is not configured' });
    }

    const formData = await request.formData();
    const file = formData.get('backgroundImage') as File | null;
    const blur = parseFloat(formData.get('blur')?.toString() || '0');
    const brightness = parseFloat(formData.get('brightness')?.toString() || '1');
    const overlay = parseFloat(formData.get('overlay')?.toString() || '0.85');

    // Clamp values to valid ranges
    const clampedBlur = Math.max(0, Math.min(30, isNaN(blur) ? 0 : blur));
    const clampedBrightness = Math.max(0.1, Math.min(1.5, isNaN(brightness) ? 1 : brightness));
    const clampedOverlay = Math.max(0, Math.min(1, isNaN(overlay) ? 0.85 : overlay));

    let tempPath: string | null = null;
    try {
      if (file && file.size > 0) {
        // Validate image (5MB max)
        try {
          validateUploadedFile(file, 'image');
        } catch (e: any) {
          return fail(400, { error: e.body?.message || 'Invalid file' });
        }

        tempPath = await saveTempFile(file);
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const remotePath = `site/background-${Date.now()}.${ext}`;
        const publicUrl = await uploadToR2(tempPath, remotePath);

        if (!publicUrl) {
          return fail(500, { error: 'Failed to upload background image' });
        }

        await updateBackgroundImage(publicUrl, clampedBlur, clampedBrightness, clampedOverlay);
      } else {
        // No new image — just update the filter settings
        await updateBackgroundSettings(clampedBlur, clampedBrightness, clampedOverlay);
      }

      return { success: true, message: 'Background updated successfully' };
    } catch (error) {
      console.error('Error updating background:', error);
      return fail(500, { error: 'Failed to update background' });
    } finally {
      if (tempPath) {
        deleteTempFile(tempPath);
      }
    }
  },

  removeBackground: async ({ locals }) => {
    requireAdmin(locals.user);

    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can remove the background image' });
    }

    try {
      await removeBackgroundImage();
      return { success: true, message: 'Background removed' };
    } catch (error) {
      console.error('Error removing background:', error);
      return fail(500, { error: 'Failed to remove background' });
    }
  },

  createApiKey: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can manage API keys' });
    }

    const formData = await request.formData();
    const name = formData.get('name')?.toString()?.trim();

    if (!name) {
      return fail(400, { error: 'API key name is required' });
    }

    try {
      const apiKey = await createApiKey(name, locals.user.steamId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.API_KEY_CREATED,
        metadata: { name, keyId: apiKey.id },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: `API key "${name}" created`, newKey: apiKey.key };
    } catch (error) {
      console.error('Error creating API key:', error);
      return fail(500, { error: 'Failed to create API key' });
    }
  },

  toggleApiKey: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can manage API keys' });
    }

    const formData = await request.formData();
    const id = parseInt(formData.get('id')?.toString() || '');
    const active = formData.get('active') === 'true';

    if (isNaN(id)) {
      return fail(400, { error: 'Invalid API key ID' });
    }

    try {
      await toggleApiKey(id, active);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.API_KEY_TOGGLED,
        metadata: { keyId: id, active },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: `API key ${active ? 'enabled' : 'disabled'}` };
    } catch (error) {
      console.error('Error toggling API key:', error);
      return fail(500, { error: 'Failed to update API key' });
    }
  },

  deleteApiKey: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    if (locals.user.permissionLevel !== UserRole.ADMIN) {
      return fail(403, { error: 'Only head admins can manage API keys' });
    }

    const formData = await request.formData();
    const id = parseInt(formData.get('id')?.toString() || '');

    if (isNaN(id)) {
      return fail(400, { error: 'Invalid API key ID' });
    }

    try {
      await deleteApiKey(id);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.API_KEY_DELETED,
        metadata: { keyId: id },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'API key deleted' };
    } catch (error) {
      console.error('Error deleting API key:', error);
      return fail(500, { error: 'Failed to delete API key' });
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
