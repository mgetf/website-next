import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDiscordAuthUrl } from '$lib/server/auth/discord';
import { requireAuth } from '$lib/server/auth/permissions';

export const GET: RequestHandler = async ({ locals, request, cookies }) => {
  requireAuth(locals.user);

  const authUrl = getDiscordAuthUrl(request, locals.user.steamId, cookies);
  redirect(302, authUrl);
};
