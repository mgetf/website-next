import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { fail, redirect } from '@sveltejs/kit';
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
import {
  getArenas,
  createArena,
  updateArena,
  deleteArena,
} from '$lib/server/services/arenas';
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
import {
  getFormats,
  createFormat,
  updateFormat,
  deleteFormat,
} from '$lib/server/services/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

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

  // Transform the data for the UI and add playoff information
  const seasonsData = await Promise.all(
    seasons.map(async (season) => {
      const isLatest = seasons[0]?.id === season.id;
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
    })),
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
    requireAdmin(locals.user);

    const formData = await request.formData();
    const seasonNum = parseInt(formData.get('seasonNum') as string);
    const regionId = parseInt(formData.get('regionId') as string);
    const formatId = parseInt(formData.get('formatId') as string);
    const numWeeks = parseInt(formData.get('numWeeks') as string);

    // Validate inputs
    if (!seasonNum || seasonNum < 1) {
      return fail(400, { error: 'Invalid season number' });
    }
    if (!regionId || regionId < 1) {
      return fail(400, { error: 'Invalid region' });
    }
    if (!formatId || formatId < 1) {
      return fail(400, { error: 'Invalid format' });
    }
    if (!numWeeks || numWeeks < 1) {
      return fail(400, { error: 'Invalid number of weeks' });
    }

    try {
      await createSeason({ seasonNum, regionId, formatId, numWeeks });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.SEASON_CREATED, targetType: 'Season', metadata: { seasonNum, regionId, formatId, numWeeks }, ipAddress: getClientAddress() });
      return { success: true, message: 'Season created successfully!' };
    } catch (error) {
      console.error('Error creating season:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to create season',
      });
    }
  },

  updateSeason: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const seasonId = parseInt(formData.get('seasonId') as string);
    const seasonNum = parseInt(formData.get('seasonNum') as string);
    const regionId = parseInt(formData.get('regionId') as string);
    const formatId = parseInt(formData.get('formatId') as string);
    const numWeeks = parseInt(formData.get('numWeeks') as string);

    // Validate inputs
    if (!seasonId || seasonId < 1) {
      return fail(400, { error: 'Invalid season ID' });
    }
    if (!seasonNum || seasonNum < 1) {
      return fail(400, { error: 'Invalid season number' });
    }
    if (!regionId || regionId < 1) {
      return fail(400, { error: 'Invalid region' });
    }
    if (!formatId || formatId < 1) {
      return fail(400, { error: 'Invalid format' });
    }
    if (!numWeeks || numWeeks < 1) {
      return fail(400, { error: 'Invalid number of weeks' });
    }

    try {
      await updateSeason(seasonId, { seasonNum, regionId, formatId, numWeeks });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.SEASON_UPDATED, targetType: 'Season', targetId: String(seasonId), metadata: { seasonNum, regionId, formatId, numWeeks }, ipAddress: getClientAddress() });
      return { success: true, message: 'Season updated successfully!' };
    } catch (error) {
      console.error('Error updating season:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to update season',
      });
    }
  },

  // REGION ACTIONS
  createRegion: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const name = formData.get('name') as string;

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Region name is required' });
    }

    try {
      await createRegion(name);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.REGION_CREATED, metadata: { name }, ipAddress: getClientAddress() });
      return { success: true, message: 'Region created successfully!' };
    } catch (error) {
      console.error('Error creating region:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to create region',
      });
    }
  },

  updateRegion: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const regionId = parseInt(formData.get('regionId') as string);
    const name = formData.get('name') as string;
    const currencyCode = formData.get('currencyCode') as string;

    if (!regionId || regionId < 1) {
      return fail(400, { error: 'Invalid region ID' });
    }
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Region name is required' });
    }

    try {
      await updateRegion(regionId, {
        name,
        currencyCode: currencyCode || 'USD',
      });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.REGION_CREATED, targetType: 'Region', targetId: String(regionId), metadata: { name, currencyCode }, ipAddress: getClientAddress() });
      return { success: true, message: 'Region updated successfully!' };
    } catch (error) {
      console.error('Error updating region:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to update region',
      });
    }
  },

  toggleRegionVisibility: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const regionId = parseInt(formData.get('regionId') as string);

    if (!regionId || regionId < 1) {
      return fail(400, { error: 'Invalid region ID' });
    }

    try {
      const region = await toggleRegionVisibility(regionId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.REGION_TOGGLED, targetType: 'Region', targetId: String(regionId), metadata: { hidden: region.hidden }, ipAddress: getClientAddress() });
      return {
        success: true,
        message: `Region ${region.hidden === 0 ? 'shown' : 'hidden'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling region visibility:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to toggle region visibility',
      });
    }
  },

  // DIVISION ACTIONS
  createDivision: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const signupCost = parseFloat(formData.get('signupCost') as string) || 0;
    const regionIdStr = formData.get('regionId') as string;
    const regionId = regionIdStr ? parseInt(regionIdStr) : null;

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Division name is required' });
    }
    if (!regionId) {
      return fail(400, { error: 'Region is required' });
    }

    try {
      await createDivision({ name, signupCost, regionId });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.DIVISION_CREATED, metadata: { name, signupCost, regionId }, ipAddress: getClientAddress() });
      return { success: true, message: 'Division created successfully!' };
    } catch (error) {
      console.error('Error creating division:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to create division',
      });
    }
  },

  updateDivision: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const divisionId = parseInt(formData.get('divisionId') as string);
    const name = formData.get('name') as string;
    const signupCost = parseFloat(formData.get('signupCost') as string) || 0;
    const regionIdStr = formData.get('regionId') as string;
    const regionId = regionIdStr ? parseInt(regionIdStr) : null;

    if (!divisionId || divisionId < 1) {
      return fail(400, { error: 'Invalid division ID' });
    }
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Division name is required' });
    }
    if (!regionId) {
      return fail(400, { error: 'Region is required' });
    }

    try {
      await updateDivision(divisionId, { name, signupCost, regionId });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.DIVISION_UPDATED, targetType: 'Division', targetId: String(divisionId), metadata: { name, signupCost, regionId }, ipAddress: getClientAddress() });
      return { success: true, message: 'Division updated successfully!' };
    } catch (error) {
      console.error('Error updating division:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to update division',
      });
    }
  },

  toggleDivisionVisibility: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const divisionId = parseInt(formData.get('divisionId') as string);

    if (!divisionId || divisionId < 1) {
      return fail(400, { error: 'Invalid division ID' });
    }

    try {
      const division = await toggleDivisionVisibility(divisionId);
      return {
        success: true,
        message: `Division ${division.hidden === 0 ? 'shown' : 'hidden'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling division visibility:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to toggle division visibility',
      });
    }
  },

  // ARENA ACTIONS
  createArena: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const avatarFile = formData.get('avatarFile') as File | null;
    const avatarUrl = formData.get('avatarUrl') as string;
    const playoffMap = formData.get('playoffMap') === 'true' ? 1 : 0;

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Arena name is required' });
    }

    let finalAvatarUrl = avatarUrl?.trim() || null;

    try {
      if (avatarFile && avatarFile.size > 0) {
        validateUploadedFile(avatarFile, 'image');

        const tempPath = await saveTempFile(avatarFile);

        try {
          const fileExtension = avatarFile.name.substring(
            avatarFile.name.lastIndexOf('.'),
          );
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
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.ARENA_CREATED, metadata: { name, playoffMap }, ipAddress: getClientAddress() });
      return { success: true, message: 'Arena created successfully!' };
    } catch (error) {
      console.error('Error creating arena:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to create arena',
      });
    }
  },

  updateArena: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const arenaId = parseInt(formData.get('arenaId') as string);
    const name = formData.get('name') as string;
    const avatarFile = formData.get('avatarFile') as File | null;
    const avatarUrl = formData.get('avatarUrl') as string;
    const playoffMap = formData.get('playoffMap') === 'true' ? 1 : 0;

    if (!arenaId || arenaId < 1) {
      return fail(400, { error: 'Invalid arena ID' });
    }
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Arena name is required' });
    }

    let finalAvatarUrl = avatarUrl?.trim() || null;

    try {
      if (avatarFile && avatarFile.size > 0) {
        validateUploadedFile(avatarFile, 'image');

        const tempPath = await saveTempFile(avatarFile);

        try {
          const fileExtension = avatarFile.name.substring(
            avatarFile.name.lastIndexOf('.'),
          );
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
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.ARENA_UPDATED, targetType: 'Arena', targetId: String(arenaId), metadata: { name, playoffMap }, ipAddress: getClientAddress() });
      return { success: true, message: 'Arena updated successfully!' };
    } catch (error) {
      console.error('Error updating arena:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to update arena',
      });
    }
  },

  deleteArena: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const arenaId = parseInt(formData.get('arenaId') as string);

    if (!arenaId || arenaId < 1) {
      return fail(400, { error: 'Invalid arena ID' });
    }

    try {
      await deleteArena(arenaId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.ARENA_DELETED, targetType: 'Arena', targetId: String(arenaId), ipAddress: getClientAddress() });
      return { success: true, message: 'Arena deleted successfully!' };
    } catch (error) {
      console.error('Error deleting arena:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to delete arena',
      });
    }
  },

  // MAP BAN POOL ACTIONS
  createMapBanPool: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const name = formData.get('name') as string;

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Map ban pool name is required' });
    }

    try {
      await createMapBanPool(name);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.MAP_BAN, action: AuditAction.MAP_POOL_CREATED, metadata: { name }, ipAddress: getClientAddress() });
      return { success: true, message: 'Map ban pool created successfully!' };
    } catch (error) {
      console.error('Error creating map ban pool:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create map ban pool',
      });
    }
  },

  updateMapBanPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const poolId = parseInt(formData.get('poolId') as string);
    const name = formData.get('name') as string;

    if (!poolId || poolId < 1) {
      return fail(400, { error: 'Invalid pool ID' });
    }
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Pool name is required' });
    }

    try {
      await updateMapBanPool(poolId, name);
      return { success: true, message: 'Map ban pool updated successfully!' };
    } catch (error) {
      console.error('Error updating map ban pool:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update map ban pool',
      });
    }
  },

  toggleMapBanPoolStatus: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const poolId = parseInt(formData.get('poolId') as string);

    if (!poolId || poolId < 1) {
      return fail(400, { error: 'Invalid pool ID' });
    }

    try {
      const pool = await toggleMapBanPoolStatus(poolId);
      return {
        success: true,
        message: `Pool ${pool.isActive ? 'activated' : 'deactivated'} successfully!`,
      };
    } catch (error) {
      console.error('Error toggling pool status:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to toggle pool status',
      });
    }
  },

  addMapsToPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const poolId = parseInt(formData.get('poolId') as string);
    const arenaIds = formData
      .getAll('arenaIds')
      .map((id) => parseInt(id as string));

    if (!poolId || poolId < 1) {
      return fail(400, { error: 'Invalid pool ID' });
    }
    if (!arenaIds || arenaIds.length === 0) {
      return fail(400, { error: 'Please select at least one map' });
    }

    try {
      await addMapsToPool(poolId, arenaIds);
      return { success: true, message: 'Maps added to pool successfully!' };
    } catch (error) {
      console.error('Error adding maps to pool:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to add maps to pool',
      });
    }
  },

  removeMapFromPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const poolId = parseInt(formData.get('poolId') as string);
    const arenaId = parseInt(formData.get('arenaId') as string);

    if (!poolId || poolId < 1 || !arenaId || arenaId < 1) {
      return fail(400, { error: 'Invalid pool or arena ID' });
    }

    try {
      await removeMapFromPool(poolId, arenaId);
      return { success: true, message: 'Map removed from pool successfully!' };
    } catch (error) {
      console.error('Error removing map from pool:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove map from pool',
      });
    }
  },

  deleteMapBanPool: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const poolId = parseInt(formData.get('poolId') as string);

    if (!poolId || poolId < 1) {
      return fail(400, { error: 'Invalid pool ID' });
    }

    try {
      await deleteMapBanPool(poolId);
      return { success: true, message: 'Map ban pool deleted successfully!' };
    } catch (error) {
      console.error('Error deleting map ban pool:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete map ban pool',
      });
    }
  },

  // PLAYOFF ACTIONS
  managePlayoff: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const seasonId = parseInt(formData.get('seasonId') as string);
    const format = formData.get('format') as string;
    const numRounds = formData.get('numRounds')
      ? parseInt(formData.get('numRounds') as string)
      : null;
    const doubleElim = formData.get('doubleElim') === '1' ? 1 : 0;

    if (!seasonId || seasonId < 1) {
      return fail(400, { error: 'Invalid season ID' });
    }

    if (!format || (format !== 'tournament' && format !== 'rounds')) {
      return fail(400, { error: 'Invalid playoff format' });
    }

    if (format === 'rounds' && (!numRounds || numRounds < 1)) {
      return fail(400, {
        error:
          'Number of rounds is required for rounds format and must be >= 1',
      });
    }

    const isTournament = format === 'tournament';

    try {
      // Check if playoff already exists for this season
      const existingPlayoff = await getPlayoffBySeason(seasonId);

      if (existingPlayoff) {
        await updatePlayoffBySeason(seasonId, {
          numRounds: isTournament ? undefined : (numRounds ?? undefined),
          doubleElim,
          isTournament,
        });
        await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.PLAYOFF_UPDATED, targetType: 'Season', targetId: String(seasonId), metadata: { isTournament, numRounds, doubleElim }, ipAddress: getClientAddress() });
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
        await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.PLAYOFF_UPDATED, targetType: 'Season', targetId: String(seasonId), metadata: { isTournament, numRounds, doubleElim, created: true }, ipAddress: getClientAddress() });
        return {
          success: true,
          message: 'Playoff configuration created successfully!',
        };
      }
    } catch (error) {
      console.error('Error managing playoff:', error);
      return fail(400, {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to manage playoff configuration',
      });
    }
  },

  // FORMAT ACTIONS
  createFormat: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const code = formData.get('code') as string;

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Format name is required' });
    }
    if (!code || code.trim().length === 0) {
      return fail(400, { error: 'Format code is required' });
    }

    try {
      await createFormat({ name, code });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.FORMAT_CREATED, metadata: { name, code }, ipAddress: getClientAddress() });
      return { success: true, message: 'Format created successfully!' };
    } catch (error) {
      console.error('Error creating format:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to create format',
      });
    }
  },

  updateFormat: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const formatId = parseInt(formData.get('formatId') as string);
    const name = formData.get('name') as string;
    const code = formData.get('code') as string;

    if (!formatId || formatId < 1) {
      return fail(400, { error: 'Invalid format ID' });
    }
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Format name is required' });
    }
    if (!code || code.trim().length === 0) {
      return fail(400, { error: 'Format code is required' });
    }

    try {
      await updateFormat(formatId, { name, code });
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.FORMAT_UPDATED, targetType: 'Format', targetId: String(formatId), metadata: { name, code }, ipAddress: getClientAddress() });
      return { success: true, message: 'Format updated successfully!' };
    } catch (error) {
      console.error('Error updating format:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to update format',
      });
    }
  },

  deleteSeason: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const seasonId = parseInt(formData.get('seasonId') as string);

    if (!seasonId || seasonId < 1) {
      return fail(400, { error: 'Invalid season ID' });
    }

    try {
      await deleteSeason(seasonId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.SEASON_DELETED, targetType: 'Season', targetId: String(seasonId), ipAddress: getClientAddress() });
      return { success: true, message: 'Season deleted successfully!' };
    } catch (error) {
      console.error('Error deleting season:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to delete season',
      });
    }
  },

  deleteRegion: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const regionId = parseInt(formData.get('regionId') as string);

    if (!regionId || regionId < 1) {
      return fail(400, { error: 'Invalid region ID' });
    }

    try {
      await deleteRegion(regionId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.REGION_DELETED, targetType: 'Region', targetId: String(regionId), ipAddress: getClientAddress() });
      return { success: true, message: 'Region deleted successfully!' };
    } catch (error) {
      console.error('Error deleting region:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to delete region',
      });
    }
  },

  deleteDivision: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const divisionId = parseInt(formData.get('divisionId') as string);

    if (!divisionId || divisionId < 1) {
      return fail(400, { error: 'Invalid division ID' });
    }

    try {
      await deleteDivision(divisionId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.DIVISION_DELETED, targetType: 'Division', targetId: String(divisionId), ipAddress: getClientAddress() });
      return { success: true, message: 'Division deleted successfully!' };
    } catch (error) {
      console.error('Error deleting division:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to delete division',
      });
    }
  },

  deleteFormat: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const formatId = parseInt(formData.get('formatId') as string);

    if (!formatId || formatId < 1) {
      return fail(400, { error: 'Invalid format ID' });
    }

    try {
      await deleteFormat(formatId);
      await logAudit({ actorId: locals.user?.steamId, actorRole: locals.user?.permissionLevel, category: AuditCategory.LEAGUE_CONFIG, action: AuditAction.FORMAT_DELETED, targetType: 'Format', targetId: String(formatId), ipAddress: getClientAddress() });
      return { success: true, message: 'Format deleted successfully!' };
    } catch (error) {
      console.error('Error deleting format:', error);
      return fail(400, {
        error:
          error instanceof Error ? error.message : 'Failed to delete format',
      });
    }
  },
};
