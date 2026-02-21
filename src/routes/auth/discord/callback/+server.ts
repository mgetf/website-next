/**
 * Discord OAuth Callback
 * GET /auth/discord/callback - Discord redirects here after authorization
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  handleDiscordCallback,
  formatDiscordUsername,
  getDiscordAvatarUrl,
} from '$lib/server/auth/discord';
import { prisma } from '$lib/server/db';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Check for OAuth errors
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.error('Discord OAuth error:', oauthError);
    throw redirect(302, '/?error=discord_auth_cancelled');
  }

  if (!code || !state) {
    throw error(400, 'Missing code or state parameter');
  }

  try {
    // Exchange code for access token and get user data
    const { user: discordUser, steamId } = await handleDiscordCallback(
      code,
      state,
      request,
    );

    // Format Discord username for display
    const discordUsername = formatDiscordUsername(discordUser);
    const discordAvatar = getDiscordAvatarUrl(discordUser);

    // Upsert Discord record in database
    await prisma.discord.upsert({
      where: {
        discordId: discordUser.id,
      },
      create: {
        discordId: discordUser.id,
        discordUsername,
        discordAvatar,
        playerSteamId: steamId,
      },
      update: {
        discordUsername,
        discordAvatar,
        playerSteamId: steamId,
      },
    });

    await logAudit({
      actorId: steamId,
      category: AuditCategory.AUTH,
      action: AuditAction.AUTH_DISCORD_LINKED,
      targetType: 'User',
      targetId: steamId,
      metadata: { discordId: discordUser.id, discordUsername },
      ipAddress: getClientAddress(),
    });

    // Redirect back to user profile with success message
    throw redirect(302, `/users/${steamId}?discord=linked`);
  } catch (err) {
    console.error('Discord callback error:', err);

    // If it's already a redirect or error, rethrow it
    if (
      err &&
      typeof err === 'object' &&
      ('status' in err || 'location' in err)
    ) {
      throw err;
    }

    // Otherwise redirect to home with error
    throw redirect(302, '/?error=discord_link_failed');
  }
};
