import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/permissions';
import { createMapFile } from '$lib/server/services/mapFiles';
import { isR2Available } from '$lib/server/utils/r2Upload';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getErrorMessage } from '$lib/server/utils/errors';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  requireAdmin(locals.user);

  if (!isR2Available()) {
    return json({ error: 'File storage is not configured on this server' }, { status: 400 });
  }

  const formData = await request.formData();
  const bspFile = formData.get('bspFile');
  const cfgFile = formData.get('cfgFile');
  const thumbnailFile = formData.get('thumbnailFile');
  const description = formData.get('description');

  if (!(bspFile instanceof File) || bspFile.size === 0) {
    return json({ error: 'A .bsp map file is required' }, { status: 400 });
  }
  if (!(cfgFile instanceof File) || cfgFile.size === 0) {
    return json({ error: 'A .cfg spawn config file is required' }, { status: 400 });
  }

  const thumbnail = thumbnailFile instanceof File && thumbnailFile.size > 0 ? thumbnailFile : null;

  try {
    const mapFile = await createMapFile({
      bspFile,
      cfgFile,
      thumbnailFile: thumbnail,
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

    return json({ success: true, message: `Map "${mapFile.name}" uploaded successfully` });
  } catch (err) {
    console.error('Error uploading map:', err);
    return json({ error: getErrorMessage(err, 'Failed to upload map') }, { status: 400 });
  }
};
