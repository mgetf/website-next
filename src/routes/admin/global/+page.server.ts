import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementVisibility,
  deleteAnnouncement,
} from '$lib/server/services/announcements';
import {
  getGlobalSettings,
  updateGlobalSettings,
  updateRegionSignupSeason,
  toggleSeasonSignupsOpen,
  toggleSeasonRosterLocked,
  toggleSeasonPaymentRequired,
  updateSeasonSettings,
} from '$lib/server/services/settings';
import { getAllActiveSignupSeasons } from '$lib/server/services/signupSeasons';
import { getRegions } from '$lib/server/services/regions';
import { getSeasons } from '$lib/server/services/seasons';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import {
  getSteamItems,
  createSteamItem as createSteamItemService,
  updateSteamItem as updateSteamItemService,
  deleteSteamItem as deleteSteamItemService,
} from '$lib/server/services/steam-items';

const createAnnouncementSchema = z.object({
  content: z
    .string()
    .min(1, 'Announcement content is required')
    .max(500, 'Announcement content must be less than 500 characters'),
});

const editAnnouncementSchema = z.object({
  id: z.coerce.number().int().positive('Invalid announcement ID'),
  content: z
    .string()
    .min(1, 'Announcement content is required')
    .max(500, 'Announcement content must be less than 500 characters'),
});

const toggleVisibilitySchema = z.object({
  id: z.coerce.number().int().positive('Invalid announcement ID'),
  visible: z.string().transform((s) => s === '1'),
});

const announcementIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid announcement ID'),
});

const seasonIdSchema = z.object({
  seasonId: z.coerce.number().int().positive('Invalid season ID'),
});

const seasonMatchSettingsSchema = z.object({
  seasonId: z.coerce.number().int().positive('Invalid season ID'),
  matchWeek: z.string().optional().default(''),
  matchDeadline: z.string().optional().default(''),
});

const updateFeesSchema = z.object({
  fees: z.coerce.number().int().min(0, 'Invalid fee amount'),
});

const botSettingsSchema = z.object({
  botTradeOfferUrl: z.string().optional().default(''),
  botSteamId: z.string().optional().default(''),
});

const createSteamItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  appId: z.coerce.number().int().positive('Valid App ID is required'),
  marketHashName: z.string().min(1, 'Market hash name is required'),
  iconUrl: z.string().optional().default(''),
});

const updateSteamItemSchema = z.object({
  id: z.coerce.number().int().positive('Invalid item ID'),
  name: z.string().optional().default(''),
  iconUrl: z.string().optional().default(''),
});

const itemIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid item ID'),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [
    announcements,
    globalSettings,
    regions,
    seasons,
    formats,
    activeSignupSeasons,
    steamItems,
  ] = await Promise.all([
    getAnnouncements(),
    getGlobalSettings(),
    getRegions(),
    getSeasons(),
    getFormatsForFilter(),
    getAllActiveSignupSeasons(),
    getSteamItems(),
  ]);

  // Group seasons by region for easier selection, include per-season settings
  const seasonsByRegion = seasons.reduce(
    (acc, season) => {
      const regionName = season.region.name;
      if (!acc[regionName]) {
        acc[regionName] = [];
      }
      acc[regionName].push({
        ...season,
        // Include per-season settings for display
        signupsOpen: season.signupsOpen,
        rosterLocked: season.rosterLocked,
        paymentRequired: season.paymentRequired,
        matchWeek: season.matchWeek,
        matchDeadline: season.matchDeadline,
      });
      return acc;
    },
    {} as Record<string, typeof seasons>,
  );

  // Create a lookup map for active signup seasons: { "regionId-formatId": seasonId }
  const activeSeasonMap = activeSignupSeasons.reduce(
    (acc, as) => {
      acc[`${as.regionId}-${as.formatId}`] = as.seasonId;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Create a map of season settings: { seasonId: { signupsOpen, rosterLocked, paymentRequired } }
  const seasonSettingsMap = seasons.reduce(
    (acc, season) => {
      acc[season.id] = {
        signupsOpen: season.signupsOpen,
        rosterLocked: season.rosterLocked,
        paymentRequired: season.paymentRequired,
        matchWeek: season.matchWeek,
        matchDeadline: season.matchDeadline,
      };
      return acc;
    },
    {} as Record<
      number,
      {
        signupsOpen: boolean;
        rosterLocked: boolean;
        paymentRequired: boolean;
        matchWeek: number | null;
        matchDeadline: Date | null;
      }
    >,
  );

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    announcements,
    globalSettings,
    regions,
    formats,
    seasonsByRegion,
    activeSignupSeasons,
    activeSeasonMap,
    seasonSettingsMap,
    steamItems,
  };
};

export const actions: Actions = {
  createAnnouncement: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createAnnouncementSchema);
    if (!validation.success) return validationError(validation.errors);

    const content = validation.data.content.trim();

    try {
      await createAnnouncement(content);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.ANNOUNCEMENT_CREATED,
        metadata: { content },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Announcement created successfully' };
    } catch (error) {
      console.error('Error creating announcement:', error);
      return fail(500, { error: 'Failed to create announcement' });
    }
  },

  editAnnouncement: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, editAnnouncementSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;
    const content = validation.data.content.trim();

    try {
      await updateAnnouncement(id, content);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.ANNOUNCEMENT_UPDATED,
        targetType: 'Announcement',
        targetId: String(id),
        metadata: { content },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Announcement updated successfully' };
    } catch (error) {
      console.error('Error updating announcement:', error);
      return fail(500, { error: 'Failed to update announcement' });
    }
  },

  toggleVisibility: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, toggleVisibilitySchema);
    if (!validation.success) return validationError(validation.errors);

    const { id, visible } = validation.data;

    try {
      await toggleAnnouncementVisibility(id, visible);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.ANNOUNCEMENT_TOGGLED,
        targetType: 'Announcement',
        targetId: String(id),
        metadata: { visible },
        ipAddress: getClientAddress(),
      });
      return {
        success: true,
        message: `Announcement ${visible ? 'shown' : 'hidden'} successfully`,
      };
    } catch (error) {
      console.error('Error toggling announcement visibility:', error);
      return fail(500, { error: 'Failed to toggle announcement visibility' });
    }
  },

  deleteAnnouncement: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, announcementIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

    try {
      await deleteAnnouncement(id);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.ANNOUNCEMENT_DELETED,
        targetType: 'Announcement',
        targetId: String(id),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Announcement deleted successfully' };
    } catch (error) {
      console.error('Error deleting announcement:', error);
      return fail(500, { error: 'Failed to delete announcement' });
    }
  },

  // Per-season toggle actions
  toggleSeasonSignups: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, seasonIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId } = validation.data;

    try {
      await toggleSeasonSignupsOpen(seasonId);
      return { success: true, message: 'Season signups status updated' };
    } catch (error) {
      console.error('Error toggling season signups:', error);
      return fail(500, { error: 'Failed to update season signups status' });
    }
  },

  toggleSeasonRoster: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, seasonIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId } = validation.data;

    try {
      await toggleSeasonRosterLocked(seasonId);
      return { success: true, message: 'Season roster lock status updated' };
    } catch (error) {
      console.error('Error toggling season roster lock:', error);
      return fail(500, { error: 'Failed to update season roster lock' });
    }
  },

  toggleSeasonPayment: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, seasonIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId } = validation.data;

    try {
      await toggleSeasonPaymentRequired(seasonId);
      return { success: true, message: 'Season payment requirement updated' };
    } catch (error) {
      console.error('Error toggling season payment requirement:', error);
      return fail(500, {
        error: 'Failed to update season payment requirement',
      });
    }
  },

  updateSeasonMatchSettings: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, seasonMatchSettingsSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId, matchWeek: matchWeekStr, matchDeadline: matchDeadlineStr } = validation.data;

    const matchWeek = matchWeekStr ? parseInt(matchWeekStr) : null;
    const matchDeadline = matchDeadlineStr ? new Date(matchDeadlineStr) : null;

    if (matchWeekStr && isNaN(matchWeek as number)) {
      return fail(400, { error: 'Invalid match week' });
    }

    try {
      await updateSeasonSettings(seasonId, { matchWeek, matchDeadline });
      return { success: true, message: 'Season match settings updated' };
    } catch (error) {
      console.error('Error updating season match settings:', error);
      return fail(500, { error: 'Failed to update season match settings' });
    }
  },

  updateFees: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateFeesSchema);
    if (!validation.success) return validationError(validation.errors);

    const { fees } = validation.data;

    try {
      await updateGlobalSettings({ leagueFees: fees });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.GLOBAL_SETTINGS_UPDATED,
        metadata: { leagueFees: fees },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'League fees updated' };
    } catch (error) {
      console.error('Error updating league fees:', error);
      return fail(500, { error: 'Failed to update league fees' });
    }
  },

  updateSeasonAssignments: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();

    const [regions, formats] = await Promise.all([getRegions(), getFormatsForFilter()]);

    try {
      // Process each region+format combination
      for (const region of regions) {
        for (const format of formats) {
          const fieldName = `season_${region.id}_${format.id}`;
          const value = formData.get(fieldName)?.toString();
          const seasonId = value ? parseInt(value) : null;

          if (value && isNaN(seasonId as number)) {
            return fail(400, {
              error: `Invalid season ID for ${region.name} ${format.code}`,
            });
          }

          await updateRegionSignupSeason(region.id, format.id, seasonId);
        }
      }

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SIGNUP,
        action: AuditAction.SIGNUP_SEASON_CHANGED,
        metadata: { updated: true },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Season assignments updated' };
    } catch (error) {
      console.error('Error updating season assignments:', error);
      return fail(500, { error: 'Failed to update season assignments' });
    }
  },

  updateBotSettings: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, botSettingsSchema);
    if (!validation.success) return validationError(validation.errors);

    const botTradeOfferUrl = validation.data.botTradeOfferUrl.trim() || null;
    const botSteamId = validation.data.botSteamId.trim() || null;

    try {
      await updateGlobalSettings({ botTradeOfferUrl, botSteamId });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.GLOBAL_SETTINGS_UPDATED,
        metadata: { botTradeOfferUrl, botSteamId },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Bot settings updated' };
    } catch (error) {
      console.error('Error updating bot settings:', error);
      return fail(500, { error: 'Failed to update bot settings' });
    }
  },

  createSteamItem: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createSteamItemSchema);
    if (!validation.success) return validationError(validation.errors);

    const { name, appId, marketHashName, iconUrl } = validation.data;

    try {
      await createSteamItemService({
        name: name.trim(),
        appId,
        marketHashName: marketHashName.trim(),
        iconUrl: iconUrl.trim() || null,
      });
      return { success: true, message: 'Steam item added' };
    } catch (err) {
      console.error('Error creating steam item:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to create steam item',
      });
    }
  },

  updateSteamItem: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateSteamItemSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id, name, iconUrl } = validation.data;

    try {
      await updateSteamItemService(id, {
        name: name.trim() || undefined,
        iconUrl: iconUrl.trim() || null,
      });
      return { success: true, message: 'Steam item updated' };
    } catch (err) {
      console.error('Error updating steam item:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to update steam item',
      });
    }
  },

  deleteSteamItem: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, itemIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { id } = validation.data;

    try {
      await deleteSteamItemService(id);
      return { success: true, message: 'Steam item deleted' };
    } catch (err) {
      console.error('Error deleting steam item:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to delete steam item',
      });
    }
  },
};
