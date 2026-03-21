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
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import {
  getSteamItems,
  createSteamItem as createSteamItemService,
  updateSteamItem as updateSteamItemService,
  deleteSteamItem as deleteSteamItemService,
} from '$lib/server/services/steam-items';

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
    const content = formData.get('content')?.toString().trim();

    if (!content) {
      return fail(400, { error: 'Announcement content is required' });
    }

    if (content.length > 500) {
      return fail(400, {
        error: 'Announcement content must be less than 500 characters',
      });
    }

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
    const id = parseInt(formData.get('id')?.toString() || '');
    const content = formData.get('content')?.toString().trim();

    if (!id || isNaN(id)) {
      return fail(400, { error: 'Invalid announcement ID' });
    }

    if (!content) {
      return fail(400, { error: 'Announcement content is required' });
    }

    if (content.length > 500) {
      return fail(400, {
        error: 'Announcement content must be less than 500 characters',
      });
    }

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
    const id = parseInt(formData.get('id')?.toString() || '');
    const visible = formData.get('visible') === '1';

    if (!id || isNaN(id)) {
      return fail(400, { error: 'Invalid announcement ID' });
    }

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
    const id = parseInt(formData.get('id')?.toString() || '');

    if (!id || isNaN(id)) {
      return fail(400, { error: 'Invalid announcement ID' });
    }

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
    const seasonId = parseInt(formData.get('seasonId')?.toString() || '');

    if (isNaN(seasonId)) {
      return fail(400, { error: 'Invalid season ID' });
    }

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
    const seasonId = parseInt(formData.get('seasonId')?.toString() || '');

    if (isNaN(seasonId)) {
      return fail(400, { error: 'Invalid season ID' });
    }

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
    const seasonId = parseInt(formData.get('seasonId')?.toString() || '');

    if (isNaN(seasonId)) {
      return fail(400, { error: 'Invalid season ID' });
    }

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
    const seasonId = parseInt(formData.get('seasonId')?.toString() || '');
    const matchWeekStr = formData.get('matchWeek')?.toString();
    const matchDeadlineStr = formData.get('matchDeadline')?.toString();

    if (isNaN(seasonId)) {
      return fail(400, { error: 'Invalid season ID' });
    }

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
    const fees = parseInt(formData.get('fees')?.toString() || '0');

    if (isNaN(fees) || fees < 0) {
      return fail(400, { error: 'Invalid fee amount' });
    }

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
    const botTradeOfferUrl = formData.get('botTradeOfferUrl')?.toString().trim() || null;
    const botSteamId = formData.get('botSteamId')?.toString().trim() || null;

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
    const name = formData.get('name')?.toString().trim() || '';
    const appId = parseInt(formData.get('appId')?.toString() || '');
    const marketHashName = formData.get('marketHashName')?.toString().trim() || '';
    const iconUrl = formData.get('iconUrl')?.toString().trim() || null;

    if (!name) return fail(400, { error: 'Item name is required' });
    if (isNaN(appId) || appId < 1) return fail(400, { error: 'Valid App ID is required' });
    if (!marketHashName) return fail(400, { error: 'Market hash name is required' });

    try {
      await createSteamItemService({ name, appId, marketHashName, iconUrl });
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
    const id = parseInt(formData.get('id')?.toString() || '');
    const name = formData.get('name')?.toString().trim();
    const iconUrl = formData.get('iconUrl')?.toString().trim() || null;

    if (isNaN(id)) return fail(400, { error: 'Invalid item ID' });

    try {
      await updateSteamItemService(id, { name, iconUrl });
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
    const id = parseInt(formData.get('id')?.toString() || '');

    if (isNaN(id)) return fail(400, { error: 'Invalid item ID' });

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
