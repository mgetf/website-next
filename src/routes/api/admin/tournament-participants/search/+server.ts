import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import { searchTournamentEditorUsers } from '$lib/server/services/eventEditor';

export const GET: RequestHandler = async ({ locals, url }) => {
  requireStrictAdmin(locals.user);
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (!query) return json({ success: true, data: [] });

  return json({
    success: true,
    data: await searchTournamentEditorUsers(query),
  });
};
