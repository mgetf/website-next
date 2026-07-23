import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { isR2Available } from '$lib/server/utils/r2Upload';
import {
  getMapFiles,
  createMapFile,
  deleteMapFile,
  updateMapFileDescription,
} from '$lib/server/services/mapFiles';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getErrorMessage } from '$lib/server/utils/errors';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';

const deleteSchema = z.object({
  mapId: z.coerce.number().int().positive('Invalid map ID'),
});

const updateDescriptionSchema = z.object({
  mapId: z.coerce.number().int().positive('Invalid map ID'),
  description: z.string().optional().default(''),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const maps = await getMapFiles();

  return {
    maps: maps.map((m) => ({
      id: m.id,
      name: m.name,
      bspUrl: m.bspUrl,
      bspSizeBytes: Number(m.bspSize),
      cfgUrl: m.cfgUrl,
      cfgSizeBytes: Number(m.cfgSize),
      description: m.description,
      uploadedBy: m.uploadedBy,
      uploaderName: m.uploaderName,
      createdAt: m.createdAt.toISOString(),
    })),
    isR2Available: isR2Available(),
  };
};

export const actions: Actions = {
  upload: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    if (!isR2Available()) {
      return fail(400, { error: 'File storage is not configured on this server' });
    }

    const formData = await request.formData();
    const bspFile = formData.get('bspFile');
    const cfgFile = formData.get('cfgFile');
    const description = formData.get('description');

    if (!(bspFile instanceof File) || bspFile.size === 0) {
      return fail(400, { error: 'A .bsp map file is required' });
    }

    if (!(cfgFile instanceof File) || cfgFile.size === 0) {
      return fail(400, { error: 'A .cfg spawn config file is required' });
    }

    try {
      const mapFile = await createMapFile({
        bspFile,
        cfgFile,
        description: typeof description === 'string' ? description : null,
        uploadedBy: locals.user!.steamId,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MAP_BAN,
        action: AuditAction.MAP_FILE_UPLOADED,
        targetType: 'MapFile',
        targetId: String(mapFile.id),
        metadata: { name: mapFile.name },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `Map "${mapFile.name}" uploaded successfully` };
    } catch (err) {
      console.error('Error uploading map:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to upload map') });
    }
  },

  delete: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, deleteSchema);
    if (!validation.success) return validationError(validation.errors);

    const { mapId } = validation.data;

    try {
      const map = await import('$lib/server/services/mapFiles').then((m) =>
        m.getMapFileById(mapId),
      );
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

      return { success: true, message: `Map "${mapName}" deleted` };
    } catch (err) {
      console.error('Error deleting map:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to delete map') });
    }
  },

  updateDescription: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateDescriptionSchema);
    if (!validation.success) return validationError(validation.errors);

    const { mapId, description } = validation.data;

    try {
      await updateMapFileDescription(mapId, description || null);
      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.MAP_FILE_UPDATED,
        targetType: 'MapFile',
        targetId: String(mapId),
        metadata: { description: description || null },
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Description updated' };
    } catch (err) {
      console.error('Error updating map description:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to update description') });
    }
  },
};
