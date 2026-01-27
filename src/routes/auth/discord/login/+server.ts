/**
 * Discord OAuth Login Initiation
 * GET /auth/discord/login - Redirects to Discord for authorization
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDiscordAuthUrl } from '$lib/server/auth/discord';

export const GET: RequestHandler = async ({ locals, request }) => {
  // Check if user is logged in
  if (!locals.user) {
    throw error(401, 'You must be logged in to link your Discord account');
  }

  try {
    // Generate Discord OAuth URL with user's Steam ID in state
    const authUrl = getDiscordAuthUrl(request, locals.user.steamId);

    // Redirect to Discord authorization page
    throw redirect(302, authUrl);
  } catch (err) {
    console.error('Discord OAuth initiation error:', err);

    // If it's already a redirect or error, rethrow it
    if (
      err &&
      typeof err === 'object' &&
      ('status' in err || 'location' in err)
    ) {
      throw err;
    }

    // Otherwise redirect back with error
    throw redirect(
      302,
      `/users/${locals.user.steamId}?error=discord_auth_failed`,
    );
  }
};
