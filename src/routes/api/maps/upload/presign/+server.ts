import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getPresignedUploadUrl, isR2Available } from '$lib/server/utils/r2Upload';
import { isMapNameTaken } from '$lib/server/services/mapFiles';
import { getErrorMessage } from '$lib/server/utils/errors';

const BSP_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals.user);

  if (!isR2Available()) {
    return json({ error: 'File storage is not configured on this server' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { mapName, bspSize } = body as { mapName?: unknown; bspSize?: unknown };

  if (typeof mapName !== 'string' || !mapName.trim()) {
    return json({ error: 'mapName is required' }, { status: 400 });
  }

  const rawName = mapName.trim().toLowerCase();

  if (!rawName.startsWith('mge_')) {
    return json(
      { error: 'Map name must start with mge_ (e.g. mge_chillypunch_final4)' },
      { status: 400 },
    );
  }

  if (!/^mge_[a-z0-9_]+$/.test(rawName)) {
    return json(
      { error: 'Map name may only contain lowercase letters, digits, and underscores' },
      { status: 400 },
    );
  }

  if (typeof bspSize !== 'number' || !Number.isInteger(bspSize) || bspSize <= 0) {
    return json({ error: 'bspSize must be a positive integer (bytes)' }, { status: 400 });
  }

  if (bspSize > BSP_MAX_BYTES) {
    return json(
      { error: `BSP file exceeds the maximum allowed size of ${BSP_MAX_BYTES / 1024 / 1024} MB` },
      { status: 400 },
    );
  }

  // Check for duplicate name
  if (await isMapNameTaken(rawName)) {
    return json({ error: `A map named "${rawName}" already exists` }, { status: 409 });
  }

  try {
    const bspKey = `maps/${rawName}.bsp`;
    const presignedUrl = await getPresignedUploadUrl(bspKey, 'application/octet-stream');

    if (!presignedUrl) {
      return json({ error: 'Could not generate upload URL' }, { status: 500 });
    }

    return json({ presignedUrl, bspKey });
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    return json({ error: getErrorMessage(err, 'Failed to generate upload URL') }, { status: 500 });
  }
};
