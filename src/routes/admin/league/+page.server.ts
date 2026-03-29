import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import {
  getSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
  transformSeasonForUI,
} from '$lib/server/services/seasons';
import {
  getRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  toggleRegionVisibility,
} from '$lib/server/services/regions';
import {
  getDivisions,
  createDivision,
  updateDivision,
  deleteDivision,
  toggleDivisionVisibility,
} from '$lib/server/services/divisions';
import { getArenas, createArena, updateArena, deleteArena } from '$lib/server/services/arenas';
import {
  uploadToR2,
  validateUploadedFile,
  saveTempFile,
  deleteTempFile,
} from '$lib/server/utils/r2Upload';
import {
  getMapBanPools,
  createMapBanPool,
  updateMapBanPool,
  toggleMapBanPoolStatus,
  addMapsToPool,
  removeMapFromPool,
  deleteMapBanPool,
} from '$lib/server/services/mapBanPools';
import {
  getPlayoffBySeason,
  createPlayoff,
  updatePlayoffBySeason,
} from '$lib/server/services/playoffs';
import { getFormats, createFormat, updateFormat, deleteFormat } from '$lib/server/services/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getSteamItems } from '$lib/server/services/steam-items';
import {
  upsertDivisionItemPayment,
  deleteDivisionItemPayment,
} from '$lib/server/services/division-item-payments';

const seasonIdSchema = z.object({ seasonId: z.coerce.number().int().positive() });
const regionIdSchema = z.object({ regionId: z.coerce.number().int().positive() });
const divisionIdSchema = z.object({ divisionId: z.coerce.number().int().positive() });
const arenaIdSchema = z.object({ arenaId: z.coerce.number().int().positive() });
const poolIdSchema = z.object({ poolId: z.coerce.number().int().positive() });
const formatIdSchema = z.object({ formatId: z.coerce.number().int().positive() });
const nameSchema = z.object({ name: z.string().min(1, 'Name is required') });

const createSeasonSchema = z.object({
  seasonNum: z.coerce.number().int().positive(),
  regionId: z.coerce.number().int().positive(),
  formatId: z.coerce.number().int().positive(),
  numWeeks: z.coerce.number().int().positive(),
});
const updateSeasonSchema = createSeasonSchema.extend({
  seasonId: z.coerce.number().int().positive(),
});

const updateRegionSchema = regionIdSchema.extend({
  name: z.string().min(1, 'Region name is required'),
  currencyCode: z.string().optional().default(''),
});

const createDivisionSchema = z.object({
  name: z.string().min(1, 'Division name is required'),
  signupCost: z.coerce.number().min(0).catch(0),
  regionId: z.coerce.number().int().positive(),
  steamItemId: z.coerce.number().int().catch(0),
  itemQuantity: z.coerce.number().int().catch(0),
});
const updateDivisionSchema = createDivisionSchema.extend({
  divisionId: z.coerce.number().int().positive(),
});

const createArenaSchema = z.object({
  name: z.string().min(1, 'Arena name is required'),
  avatarUrl: z.string().optional().default(''),
  playoffMap: z.string().optional().default(''),
});
const updateArenaSchema = createArenaSchema.extend({
  arenaId: z.coerce.number().int().positive(),
});

const updateMapBanPoolSchema = poolIdSchema.extend({
  name: z.string().min(1, 'Pool name is required'),
});
const addMapsToPoolSchema = poolIdSchema.extend({
  arenaIds: z.array(z.coerce.number().int().positive()).min(1, 'Please select at least one map'),
});
const removeMapFromPoolSchema = z.object({
  poolId: z.coerce.number().int().positive(),
  arenaId: z.coerce.number().int().positive(),
});

const managePlayoffSchema = z
  .object({
    seasonId: z.coerce.number().int().positive(),
    format: z.enum(['tournament', 'rounds']),
    numRounds: z.coerce.number().int().positive().optional().catch(undefined),
    doubleElim: z.string().optional().default('0'),
  })
  .refine(
    (data) => data.format !== 'rounds' || (data.numRounds !== undefined && data.numRounds >= 1),
    {
      message: 'Number of rounds is required for rounds format and must be >= 1',
      path: ['numRounds'],
    },
  );

const createFormatSchema = z.object({
  name: z.string().min(1, 'Format name is required'),
  code: z.string().min(1, 'Format code is required'),
});
const updateFormatSchema = createFormatSchema.extend({
  formatId: z.coerce.number().int().positive(),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  // Fetch all seasons with their region and team count
  const seasons = await getSeasons();

  // Fetch all regions (including hidden for admin)
  const allRegions = await getRegions();

  // Fetch all divisions (including hidden for admin)
  const allDivisions = await getDivisions();

  // Fetch all arenas
  const allArenas = await getArenas();

  // Fetch all map ban pools
  const allMapBanPools = await getMapBanPools();

  // Fetch all formats
  const allFormats = await getFormats();

  // Fetch steam items for division item payment config
  const steamItems = await getSteamItems();

  // Build a set of the latest season id per format+region combination
  const latestByFormatRegion = new Map<string, number>();
  for (const season of seasons) {
    const key = `${season.formatId}:${season.regionId}`;
    if (!latestByFormatRegion.has(key)) {
      latestByFormatRegion.set(key, season.id);
    }
  }

  // Transform the data for the UI and add playoff information
  const seasonsData = await Promise.all(
    seasons.map(async (season) => {
      const key = `${season.formatId}:${season.regionId}`;
      const isLatest = latestByFormatRegion.get(key) === season.id;
      const seasonUI = transformSeasonForUI(season, isLatest);

      // Get playoff data for this season
      const playoff = await getPlayoffBySeason(season.id);

      return {
        ...seasonUI,
        playoff: playoff
          ? {
              id: playoff.id,
              numRounds: playoff.numRounds,
              doubleElim: playoff.doubleElim,
              isTournament: playoff.isTournament,
            }
          : null,
      };
    }),
  );

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    seasons: seasonsData,
    regions: allRegions.map((r) => ({
      id: r.id,
      name: r.name,
      hidden: r.hidden,
      currencySymbol: r.currencySymbol,
      currencyCode: r.currencyCode,
      seasons: r._count.seasons,
      teams: r._count.teams,
    })),
    divisions: allDivisions.map((d) => ({
      id: d.id,
      name: d.name,
      signupCost: d.signupCost,
      hidden: d.hidden,
      regionId: d.regionId,
      teams: d._count.teams,
      itemPayment: d.itemPayment
        ? {
            steamItemId: d.itemPayment.steamItemId,
            itemQuantity: d.itemPayment.itemQuantity,
            steamItemName: d.itemPayment.steamItem.name,
          }
        : null,
    })),
    steamItems,
    arenas: allArenas.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      playoffMap: a.playoffMap,
      games: a._count.games,
    })),
    mapBanPools: allMapBanPools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      isActive: pool.isActive,
      maps: pool.mapsInPool.map((m) => ({
        id: m.arena.id,
        name: m.arena.name,
        avatar: m.arena.avatar,
        orderNum: m.orderNum,
      })),
      matchesUsed: pool._count.matchMapBans,
    })),
    formats: allFormats.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      seasons: f._count.seasons,
      teams: f._count.teams,
      activeSignupSeasons: f._count.activeSignupSeasons,
    })),
  };
};

export const actions: Actions = {
  createSeason: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    // Validate inputs
    const validation = validateForm(formData, createSeasonSchema);
    if (!validation.success) return validationError(validation.errors);
    const { seasonNum, regionId, formatId, numWeeks } = validation.data;

    try {
      await createSeason({ seasonNum, regionId, formatId, numWeeks });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.SEASON_CREATED,
        targetType: 'Season',
        metadata: { seasonNum, regionId, formatId, numWeeks },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Season created successfully!' };
    } catch (error) {
      console.error('Error creating season:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create season',
      });
    }
  },

  updateSeason: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    // Validate inputs
    const validation = validateForm(formData, updateSeasonSchema);
    if (!validation.success) return validationError(validation.errors);
    const { seasonId, seasonNum, regionId, formatId, numWeeks } = validation.data;

    try {
      await updateSeason(seasonId, { seasonNum, regionId, formatId, numWeeks });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.SEASON_UPDATED,
        targetType: 'Season',
        targetId: String(seasonId),
        metadata: { seasonNum, regionId, formatId, numWeeks },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Season updated successfully!' };
    } catch (error) {
      console.error('Error updating season:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update season',
      });
    }
  },

  // REGION ACTIONS
  createRegion: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, nameSchema);
    if (!validation.success) return validationError(validation.errors);
    const { name } = validation.data;

    try {
      await createRegion(name);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.REGION_CREATED,
        metadata: { name },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Region created successfully!' };
    } catch (error) {
      console.error('Error creating region:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create region',
      });
    }
  },

  updateRegion: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateRegionSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId, name, currencyCode } = validation.data;

    try {
      await updateRegion(regionId, {
        name,
        currencyCode: currencyCode || 'USD',
      });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.REGION_CREATED,
        targetType: 'Region',
        targetId: String(regionId),
        metadata: { name, currencyCode },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Region updated successfully!' };
    } catch (error) {
      console.error('Error updating region:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update region',
      });
    }
  },

  toggleRegionVisibility: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, regionIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId } = validation.data;

    try {
      const region = await toggleRegionVisibility(regionId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.REGION_TOGGLED,
        targetType: 'Region',
        targetId: String(regionId),
        metadata: { hidden: region.hidden },
        ipAddress: getClientAddress(),
      });
      return {
        success: true,
        message: `Region ${region.hidden === 0 ? 'shown' : 'hidden'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling region visibility:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to toggle region visibility',
      });
    }
  },

  // DIVISION ACTIONS
  createDivision: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createDivisionSchema);
    if (!validation.success) return validationError(validation.errors);
    const { name, signupCost, regionId, steamItemId, itemQuantity } = validation.data;

    try {
      const division = await createDivision({ name, signupCost, regionId });

      if (steamItemId && itemQuantity && itemQuantity > 0) {
        await upsertDivisionItemPayment(division.id, { steamItemId, itemQuantity });
      }

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.DIVISION_CREATED,
        metadata: { name, signupCost, regionId },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Division created successfully!' };
    } catch (error) {
      console.error('Error creating division:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create division',
      });
    }
  },

  updateDivision: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateDivisionSchema);
    if (!validation.success) return validationError(validation.errors);
    const { divisionId, name, signupCost, regionId, steamItemId, itemQuantity } = validation.data;

    try {
      await updateDivision(divisionId, { name, signupCost, regionId });

      if (steamItemId && itemQuantity && itemQuantity > 0) {
        await upsertDivisionItemPayment(divisionId, { steamItemId, itemQuantity });
      } else {
        await deleteDivisionItemPayment(divisionId);
      }

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.DIVISION_UPDATED,
        targetType: 'Division',
        targetId: String(divisionId),
        metadata: { name, signupCost, regionId },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Division updated successfully!' };
    } catch (error) {
      console.error('Error updating division:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update division',
      });
    }
  },

  toggleDivisionVisibility: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, divisionIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { divisionId } = validation.data;

    try {
      const division = await toggleDivisionVisibility(divisionId);
      return {
        success: true,
        message: `Division ${division.hidden === 0 ? 'shown' : 'hidden'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling division visibility:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to toggle division visibility',
      });
    }
  },

  // ARENA ACTIONS
  createArena: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createArenaSchema);
    if (!validation.success) return validationError(validation.errors);
    const { name, avatarUrl, playoffMap: playoffMapStr } = validation.data;
    const playoffMap = playoffMapStr === 'true' ? 1 : 0;
    const avatarFile = formData.get('avatarFile');

    let finalAvatarUrl = avatarUrl?.trim() || null;

    try {
      if (avatarFile instanceof File && avatarFile.size > 0) {
        validateUploadedFile(avatarFile, 'image');

        const tempPath = await saveTempFile(avatarFile);

        try {
          const fileExtension = avatarFile.name.substring(avatarFile.name.lastIndexOf('.'));
          const remotePath = `arena-avatars/${Date.now()}${fileExtension}`;
          const uploadedUrl = await uploadToR2(tempPath, remotePath);

          if (uploadedUrl) {
            finalAvatarUrl = uploadedUrl;
          }
        } finally {
          deleteTempFile(tempPath);
        }
      }

      await createArena({ name, avatar: finalAvatarUrl, playoffMap });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.ARENA_CREATED,
        metadata: { name, playoffMap },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Arena created successfully!' };
    } catch (error) {
      console.error('Error creating arena:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create arena',
      });
    }
  },

  updateArena: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateArenaSchema);
    if (!validation.success) return validationError(validation.errors);
    const { arenaId, name, avatarUrl, playoffMap: playoffMapStr } = validation.data;
    const playoffMap = playoffMapStr === 'true' ? 1 : 0;
    const avatarFile = formData.get('avatarFile');

    let finalAvatarUrl = avatarUrl?.trim() || null;

    try {
      if (avatarFile instanceof File && avatarFile.size > 0) {
        validateUploadedFile(avatarFile, 'image');

        const tempPath = await saveTempFile(avatarFile);

        try {
          const fileExtension = avatarFile.name.substring(avatarFile.name.lastIndexOf('.'));
          const remotePath = `arena-avatars/${Date.now()}${fileExtension}`;
          const uploadedUrl = await uploadToR2(tempPath, remotePath);

          if (uploadedUrl) {
            finalAvatarUrl = uploadedUrl;
          }
        } finally {
          deleteTempFile(tempPath);
        }
      }

      await updateArena(arenaId, { name, avatar: finalAvatarUrl, playoffMap });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.ARENA_UPDATED,
        targetType: 'Arena',
        targetId: String(arenaId),
        metadata: { name, playoffMap },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Arena updated successfully!' };
    } catch (error) {
      console.error('Error updating arena:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update arena',
      });
    }
  },

  deleteArena: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, arenaIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { arenaId } = validation.data;

    try {
      await deleteArena(arenaId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.ARENA_DELETED,
        targetType: 'Arena',
        targetId: String(arenaId),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Arena deleted successfully!' };
    } catch (error) {
      console.error('Error deleting arena:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete arena',
      });
    }
  },

  // MAP BAN POOL ACTIONS
  createMapBanPool: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, nameSchema);
    if (!validation.success) return validationError(validation.errors);
    const { name } = validation.data;

    try {
      await createMapBanPool(name);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MAP_BAN,
        action: AuditAction.MAP_POOL_CREATED,
        metadata: { name },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Map ban pool created successfully!' };
    } catch (error) {
      console.error('Error creating map ban pool:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create map ban pool',
      });
    }
  },

  updateMapBanPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateMapBanPoolSchema);
    if (!validation.success) return validationError(validation.errors);
    const { poolId, name } = validation.data;

    try {
      await updateMapBanPool(poolId, name);
      return { success: true, message: 'Map ban pool updated successfully!' };
    } catch (error) {
      console.error('Error updating map ban pool:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update map ban pool',
      });
    }
  },

  toggleMapBanPoolStatus: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, poolIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { poolId } = validation.data;

    try {
      const pool = await toggleMapBanPoolStatus(poolId);
      return {
        success: true,
        message: `Pool ${pool.isActive ? 'activated' : 'deactivated'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling pool status:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to toggle pool status',
      });
    }
  },

  addMapsToPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, addMapsToPoolSchema, ['arenaIds']);
    if (!validation.success) return validationError(validation.errors);
    const { poolId, arenaIds } = validation.data;

    try {
      await addMapsToPool(poolId, arenaIds);
      return { success: true, message: 'Maps added to pool successfully!' };
    } catch (error) {
      console.error('Error adding maps to pool:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to add maps to pool',
      });
    }
  },

  removeMapFromPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, removeMapFromPoolSchema);
    if (!validation.success) return validationError(validation.errors);
    const { poolId, arenaId } = validation.data;

    try {
      await removeMapFromPool(poolId, arenaId);
      return { success: true, message: 'Map removed from pool successfully!' };
    } catch (error) {
      console.error('Error removing map from pool:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to remove map from pool',
      });
    }
  },

  deleteMapBanPool: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, poolIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { poolId } = validation.data;

    try {
      await deleteMapBanPool(poolId);
      return { success: true, message: 'Map ban pool deleted successfully!' };
    } catch (error) {
      console.error('Error deleting map ban pool:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete map ban pool',
      });
    }
  },

  // PLAYOFF ACTIONS
  managePlayoff: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, managePlayoffSchema);
    if (!validation.success) return validationError(validation.errors);
    const { seasonId, format, numRounds, doubleElim: doubleElimStr } = validation.data;
    const isTournament = format === 'tournament';
    const doubleElim = doubleElimStr === '1' ? 1 : 0;

    try {
      // Check if playoff already exists for this season
      const existingPlayoff = await getPlayoffBySeason(seasonId);

      if (existingPlayoff) {
        await updatePlayoffBySeason(seasonId, {
          numRounds: isTournament ? undefined : (numRounds ?? undefined),
          doubleElim,
          isTournament,
        });
        await logAudit({
          actorId: locals.user?.steamId,
          actorRole: locals.user?.permissionLevel,
          category: AuditCategory.LEAGUE_CONFIG,
          action: AuditAction.PLAYOFF_UPDATED,
          targetType: 'Season',
          targetId: String(seasonId),
          metadata: { isTournament, numRounds, doubleElim },
          ipAddress: getClientAddress(),
        });
        return {
          success: true,
          message: 'Playoff configuration updated successfully!',
        };
      } else {
        await createPlayoff({
          seasonId,
          numRounds: isTournament ? undefined : (numRounds ?? undefined),
          doubleElim,
          isTournament,
        });
        await logAudit({
          actorId: locals.user?.steamId,
          actorRole: locals.user?.permissionLevel,
          category: AuditCategory.LEAGUE_CONFIG,
          action: AuditAction.PLAYOFF_UPDATED,
          targetType: 'Season',
          targetId: String(seasonId),
          metadata: { isTournament, numRounds, doubleElim, created: true },
          ipAddress: getClientAddress(),
        });
        return {
          success: true,
          message: 'Playoff configuration created successfully!',
        };
      }
    } catch (error) {
      console.error('Error managing playoff:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to manage playoff configuration',
      });
    }
  },

  // FORMAT ACTIONS
  createFormat: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createFormatSchema);
    if (!validation.success) return validationError(validation.errors);
    const { name, code } = validation.data;

    try {
      await createFormat({ name, code });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.FORMAT_CREATED,
        metadata: { name, code },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Format created successfully!' };
    } catch (error) {
      console.error('Error creating format:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to create format',
      });
    }
  },

  updateFormat: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateFormatSchema);
    if (!validation.success) return validationError(validation.errors);
    const { formatId, name, code } = validation.data;

    try {
      await updateFormat(formatId, { name, code });
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.FORMAT_UPDATED,
        targetType: 'Format',
        targetId: String(formatId),
        metadata: { name, code },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Format updated successfully!' };
    } catch (error) {
      console.error('Error updating format:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update format',
      });
    }
  },

  deleteSeason: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, seasonIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { seasonId } = validation.data;

    try {
      await deleteSeason(seasonId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.SEASON_DELETED,
        targetType: 'Season',
        targetId: String(seasonId),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Season deleted successfully!' };
    } catch (error) {
      console.error('Error deleting season:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete season',
      });
    }
  },

  deleteRegion: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, regionIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId } = validation.data;

    try {
      await deleteRegion(regionId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.REGION_DELETED,
        targetType: 'Region',
        targetId: String(regionId),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Region deleted successfully!' };
    } catch (error) {
      console.error('Error deleting region:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete region',
      });
    }
  },

  deleteDivision: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, divisionIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { divisionId } = validation.data;

    try {
      await deleteDivision(divisionId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.DIVISION_DELETED,
        targetType: 'Division',
        targetId: String(divisionId),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Division deleted successfully!' };
    } catch (error) {
      console.error('Error deleting division:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete division',
      });
    }
  },

  deleteFormat: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, formatIdSchema);
    if (!validation.success) return validationError(validation.errors);
    const { formatId } = validation.data;

    try {
      await deleteFormat(formatId);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.LEAGUE_CONFIG,
        action: AuditAction.FORMAT_DELETED,
        targetType: 'Format',
        targetId: String(formatId),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Format deleted successfully!' };
    } catch (error) {
      console.error('Error deleting format:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete format',
      });
    }
  },
};
