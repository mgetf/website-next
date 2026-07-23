/**
 * Admin Site Settings - Server Logic
 * Manage site content and settings
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin } from '$lib/server/auth/permissions';
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
  extensionForImageMime,
  isR2Available,
} from '$lib/server/utils/r2Upload';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { UserRole } from '$lib/types/user';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { createApiKey, getApiKeys, toggleApiKey, deleteApiKey } from '$lib/server/services/apiKeys';

const siteTitleSchema = z.object({
  siteTitle: z.string().min(1, 'Site title is required'),
});

const homepageContentSchema = z.object({
  subtitle: z.string().optional().default(''),
  about: z.string().optional().default(''),
});

const rulebookSchema = z.object({
  content: z.string().min(1, 'Rulebook content cannot be empty'),
});

const matchCreatedMessageSchema = z.object({
  content: z.string().min(1, 'Match created message cannot be empty'),
});

const backgroundSettingsSchema = z.object({
  blur: z.coerce.number().min(0).max(30).default(0),
  brightness: z.coerce.number().min(0.1).max(1.5).default(1),
  overlay: z.coerce.number().min(0).max(1).default(0.85),
});

const apiKeyNameSchema = z.object({
  name: z.string().min(1, 'API key name is required'),
});

const apiKeyToggleSchema = z.object({
  id: z.coerce.number().int().positive('Invalid API key ID'),
  active: z.string().transform((s) => s === 'true'),
});

const apiKeyIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid API key ID'),
});

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

  const [rulebookContent, matchCreatedMessageContent] = await Promise.all([
    getContent(CONTENT_KEYS.RULEBOOK),
    getContent(CONTENT_KEYS.MATCH_CREATED_MESSAGE),
  ]);

  return {
    settings,
    content: contentMap,
    rulebookContent: rulebookContent || getDefaultContent(CONTENT_KEYS.RULEBOOK),
    matchCreatedMessage:
      matchCreatedMessageContent || getDefaultContent(CONTENT_KEYS.MATCH_CREATED_MESSAGE),
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
    const validation = validateForm(formData, siteTitleSchema);
    if (!validation.success) return validationError(validation.errors);

    const siteTitle = validation.data.siteTitle.trim();

    try {
      await updateSiteSettings({ siteTitle });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.SITE_SETTINGS_UPDATED,
        metadata: { siteTitle: siteTitle.trim() },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Site settings updated' };
    } catch (error) {
      console.error('Error updating site settings:', error);
      return fail(500, { error: 'Failed to update settings' });
    }
  },

  updateHomepageContent: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, homepageContentSchema);
    if (!validation.success) return validationError(validation.errors);

    const { subtitle, about } = validation.data;

    try {
      await Promise.all([
        upsertContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE, subtitle, locals.user.steamId),
        upsertContent(CONTENT_KEYS.HOMEPAGE_ABOUT, about, locals.user.steamId),
      ]);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.CONTENT_UPDATED,
        metadata: { keys: ['homepage_subtitle', 'homepage_about'] },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Homepage content updated' };
    } catch (error) {
      console.error('Error updating homepage content:', error);
      return fail(500, { error: 'Failed to update content' });
    }
  },

  updateRulebook: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, rulebookSchema);
    if (!validation.success) return validationError(validation.errors);

    const { content } = validation.data;

    try {
      await upsertContent(CONTENT_KEYS.RULEBOOK, content, locals.user.steamId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.CONTENT_UPDATED,
        metadata: { key: 'rulebook' },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Rulebook updated' };
    } catch (error) {
      console.error('Error updating rulebook:', error);
      return fail(500, { error: 'Failed to update rulebook' });
    }
  },

  updateMatchCreatedMessage: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, matchCreatedMessageSchema);
    if (!validation.success) return validationError(validation.errors);

    const { content } = validation.data;

    try {
      await upsertContent(CONTENT_KEYS.MATCH_CREATED_MESSAGE, content, locals.user.steamId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.CONTENT_UPDATED,
        metadata: { key: 'match_created_message' },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Match created message updated' };
    } catch (error) {
      console.error('Error updating match created message:', error);
      return fail(500, { error: 'Failed to update match created message' });
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
    const validation = validateForm(formData, backgroundSettingsSchema);
    if (!validation.success) return validationError(validation.errors);

    // Clamp values to valid ranges
    const {
      blur: clampedBlur,
      brightness: clampedBrightness,
      overlay: clampedOverlay,
    } = validation.data;
    const file = formData.get('backgroundImage');

    let tempPath: string | null = null;
    try {
      if (file instanceof File && file.size > 0) {
        // Validate image (5MB max)
        try {
          validateUploadedFile(file, 'image');
        } catch (e) {
          return fail(400, { error: getErrorMessage(e, 'Invalid file') });
        }

        tempPath = await saveTempFile(file);
        const ext = extensionForImageMime(file.type).replace(/^\./, '');
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
    const validation = validateForm(formData, apiKeyNameSchema);
    if (!validation.success) return validationError(validation.errors);

    const name = validation.data.name.trim();

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
    const validation = validateForm(formData, apiKeyToggleSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id, active } = validation.data;

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
    const validation = validateForm(formData, apiKeyIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

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
    const file = formData.get('favicon');

    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'No file provided' });
    }

    // Validate file (image types, max 1MB for favicon)
    try {
      validateUploadedFile(file, 'image');
      if (file.size > 1024 * 1024) {
        return fail(400, { error: 'Favicon must be less than 1MB' });
      }
    } catch (e) {
      return fail(400, { error: getErrorMessage(e, 'Invalid file') });
    }

    let tempPath: string | null = null;
    try {
      // Save temp file
      tempPath = await saveTempFile(file);

      // Upload to R2
      const ext = extensionForImageMime(file.type).replace(/^\./, '');
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
