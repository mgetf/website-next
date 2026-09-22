import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getMapFiles,
  getMapFileById,
  createMapFile,
  updateMapFile,
  deleteMapFile,
  MAP_NAME_PATTERN,
} from '$lib/server/services/mapFiles';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getErrorMessage } from '$lib/server/utils/errors';
import { z } from 'zod';
import { validateForm, validationError, formError, formSuccess } from '$lib/server/utils/forms';

const httpsUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .pipe(z.url({ protocol: /^https$/, error: 'Must be a valid https URL' }));

const mapNameSchema = z
  .string()
  .trim()
  .min(1, 'Map name is required')
  .transform((value) => value.toLowerCase())
  .refine((value) => MAP_NAME_PATTERN.test(value), {
    message: 'Map name may only contain lowercase letters, numbers, and underscores',
  });

const upsertSchema = z.object({
  name: mapNameSchema,
  bspUrl: httpsUrlSchema,
  cfgUrl: httpsUrlSchema,
  description: z.string().optional().default(''),
});

const updateSchema = upsertSchema.extend({
  mapId: z.coerce.number().int().positive('Invalid map ID'),
});

const deleteSchema = z.object({
  mapId: z.coerce.number().int().positive('Invalid map ID'),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const maps = await getMapFiles();

  return {
    maps: maps.map((m) => ({
      id: m.id,
      name: m.name,
      bspUrl: m.bspUrl,
      cfgUrl: m.cfgUrl,
      description: m.description,
      uploadedBy: m.uploadedBy,
      uploaderName: m.uploaderName,
      createdAt: m.createdAt.toISOString(),
    })),
  };
};

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, upsertSchema);
    if (!validation.success) return validationError(validation.errors);

    const { name, bspUrl, cfgUrl, description } = validation.data;

    try {
      const mapFile = await createMapFile({
        name,
        bspUrl,
        cfgUrl,
        description,
        uploadedBy: locals.user!.steamId,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MAP_BAN,
        action: AuditAction.MAP_FILE_UPLOADED,
        targetType: 'MapFile',
        targetId: String(mapFile.id),
        metadata: { name: mapFile.name, bspUrl: mapFile.bspUrl, cfgUrl: mapFile.cfgUrl },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, `Map "${mapFile.name}" added`);
    } catch (err) {
      console.error('Error creating map catalog entry:', err);
      return formError(getErrorMessage(err, 'Failed to add map'));
    }
  },

  update: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateSchema);
    if (!validation.success) return validationError(validation.errors);

    const { mapId, name, bspUrl, cfgUrl, description } = validation.data;

    try {
      const mapFile = await updateMapFile({
        id: mapId,
        name,
        bspUrl,
        cfgUrl,
        description,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.MAP_FILE_UPDATED,
        targetType: 'MapFile',
        targetId: String(mapId),
        metadata: { name: mapFile.name, bspUrl: mapFile.bspUrl, cfgUrl: mapFile.cfgUrl },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, `Map "${mapFile.name}" updated`);
    } catch (err) {
      console.error('Error updating map catalog entry:', err);
      return formError(getErrorMessage(err, 'Failed to update map'));
    }
  },

  delete: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, deleteSchema);
    if (!validation.success) return validationError(validation.errors);

    const { mapId } = validation.data;

    try {
      const map = await getMapFileById(mapId);
      const mapName = map.name;

      await deleteMapFile(mapId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MAP_BAN,
        action: AuditAction.MAP_FILE_DELETED,
        targetType: 'MapFile',
        targetId: String(mapId),
        metadata: { name: mapName },
        ipAddress: getClientAddress(),
      });

      return formSuccess(undefined, `Map "${mapName}" deleted`);
    } catch (err) {
      console.error('Error deleting map catalog entry:', err);
      return formError(getErrorMessage(err, 'Failed to delete map'));
    }
  },
};
