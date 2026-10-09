import type { RequestHandler } from './$types';

import { requireAdmin } from '#lib/server/auth/permissions.js';
import { getDbHealthSnapshot } from '#lib/server/services/dbHealth.js';

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals.user);

  const health = await getDbHealthSnapshot();
  return Response.json({ success: true, data: health });
};
