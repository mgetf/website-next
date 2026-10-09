import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDiscordAuthUrl } from '#lib/server/auth/discord.js';
import { requireAuth } from '#lib/server/auth/permissions.js';

export const GET: RequestHandler = async ({ locals, request, cookies }) => {
  requireAuth(locals.user);

  const authUrl = getDiscordAuthUrl(request, locals.user.steamId, cookies);
  redirect(302, authUrl, { external: ['https://discord.com'] });
};
