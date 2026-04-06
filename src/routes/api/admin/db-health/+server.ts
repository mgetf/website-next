import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getDbHealthSnapshot } from '$lib/server/services/dbHealth';

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals.user);

  const health = await getDbHealthSnapshot();
  return json({ success: true, data: health });
};
