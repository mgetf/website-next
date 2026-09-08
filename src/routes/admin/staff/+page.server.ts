import type { Actions, PageServerLoad } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import { z } from 'zod';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getDivisions } from '$lib/server/services/divisions';
import { getRegions } from '$lib/server/services/regions';
import { getFormatsForFilter } from '$lib/server/services/formats';
import {
  getRegionIdsByFormat,
  parseStaffAssignmentTokens,
} from '$lib/server/services/staffAssignments';
import {
  demoteStaff,
  designateStaff,
  formatStaffResyncSummary,
  formatStaffSyncMessage,
  getStaffRoster,
  isStaffRole,
  resyncAllStaff,
  retryStaffSync,
  searchUsersForStaff,
} from '$lib/server/services/staff';

const steamIdSchema = z.object({
  steamId: z.string().min(1, 'Invalid user ID'),
});

const designateSchema = z.object({
  steamId: z.string().min(1, 'Invalid user ID'),
  permissionLevel: z.enum(['MODERATOR', 'ADMIN']),
  staffAssignments: z.array(z.string()).optional().default([]),
});

export const load: PageServerLoad = async ({ locals, url }) => {
  requireStrictAdmin(locals.user);

  const search = url.searchParams.get('q') ?? '';

  const [roster, divisions, regions, formats, regionIdsByFormat, searchResults] = await Promise.all(
    [
      getStaffRoster(),
      getDivisions(),
      getRegions(),
      getFormatsForFilter(),
      getRegionIdsByFormat(),
      search ? searchUsersForStaff(search) : Promise.resolve([]),
    ],
  );

  return {
    currentSteamId: locals.user.steamId,
    roster,
    search,
    searchResults,
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    formats: formats.map((format) => ({
      id: format.id,
      name: format.name,
      themeKey: format.themeKey,
    })),
    regionIdsByFormat,
    divisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      regionId: division.regionId,
      regionName: division.region?.name ?? '',
    })),
  };
};

export const actions: Actions = {
  designate: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, designateSchema, ['staffAssignments']);
    if (!validation.success) return validationError(validation.errors);

    const { steamId, permissionLevel, staffAssignments } = validation.data;
    if (!isStaffRole(permissionLevel)) {
      return formError('Invalid staff role', 400);
    }

    try {
      const parsedAssignments = parseStaffAssignmentTokens(staffAssignments);
      const result = await designateStaff(
        locals.user.steamId,
        steamId,
        permissionLevel,
        parsedAssignments,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.STAFF,
        action: AuditAction.STAFF_DESIGNATED,
        targetType: 'User',
        targetId: steamId,
        metadata: {
          role: permissionLevel,
          sourcebansStatus: result.sourcebansStatus,
          discordStatus: result.discordStatus,
        },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, formatStaffSyncMessage(result));
    } catch (error) {
      return formError(getErrorMessage(error, 'Failed to designate staff'), 400);
    }
  },

  demote: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await demoteStaff(locals.user.steamId, validation.data.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.STAFF,
        action: AuditAction.STAFF_DEMOTED,
        targetType: 'User',
        targetId: validation.data.steamId,
        metadata: {
          sourcebansStatus: result.sourcebansStatus,
          discordStatus: result.discordStatus,
        },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, formatStaffSyncMessage(result));
    } catch (error) {
      return formError(getErrorMessage(error, 'Failed to demote staff'), 400);
    }
  },

  retry: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await retryStaffSync(validation.data.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.STAFF,
        action: AuditAction.STAFF_SYNC_RETRY,
        targetType: 'User',
        targetId: validation.data.steamId,
        metadata: {
          sourcebansStatus: result.sourcebansStatus,
          discordStatus: result.discordStatus,
        },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, formatStaffSyncMessage(result));
    } catch (error) {
      return formError(getErrorMessage(error, 'Failed to retry staff sync'), 400);
    }
  },

  syncAll: async ({ locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    try {
      const counts = await resyncAllStaff();

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.STAFF,
        action: AuditAction.STAFF_SYNC_ALL,
        targetType: 'Staff',
        targetId: 'all',
        metadata: counts,
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, formatStaffResyncSummary(counts));
    } catch (error) {
      return formError(getErrorMessage(error, 'Failed to resync staff'), 400);
    }
  },
};
