import type { RequestHandler } from './$types';
import { requireStrictAdmin } from '#lib/server/auth/permissions.js';
import { searchTournamentEditorUsers } from '#lib/server/services/eventEditor.js';

export const GET: RequestHandler = async ({ locals, url }) => {
  requireStrictAdmin(locals.user);
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (!query) return Response.json({ success: true, data: [] });

  return Response.json({
    success: true,
    data: await searchTournamentEditorUsers(query),
  });
};
