import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDiscordAuthUrl } from '$lib/server/auth/discord';

export const GET: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'You must be logged in to link your Discord account');
  }

  const authUrl = getDiscordAuthUrl(request, locals.user.steamId);
  redirect(302, authUrl);
};
