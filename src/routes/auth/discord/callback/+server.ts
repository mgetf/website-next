import { redirect, error, type RequestHandler } from '@sveltejs/kit';
import {
  handleDiscordCallback,
  formatDiscordUsername,
  getDiscordAvatarUrl,
} from '$lib/server/auth/discord';
import { linkDiscordAccount } from '$lib/server/services/users';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.error('[Discord OAuth] User denied or error:', oauthError);
    redirect(302, '/?error=discord_auth_cancelled');
  }

  if (!code || !state) {
    error(400, 'Missing code or state parameter');
  }

  let discordUser;
  let steamId: string;

  try {
    ({ user: discordUser, steamId } = await handleDiscordCallback(code, state, request));
  } catch (err) {
    console.error('[Discord OAuth] Callback failed:', err);
    redirect(302, '/?error=discord_link_failed');
  }

  const discordUsername = formatDiscordUsername(discordUser);
  const discordAvatar = getDiscordAvatarUrl(discordUser);

  await linkDiscordAccount(discordUser.id, discordUsername, discordAvatar, steamId);

  await logAudit({
    actorId: steamId,
    category: AuditCategory.AUTH,
    action: AuditAction.AUTH_DISCORD_LINKED,
    targetType: 'User',
    targetId: steamId,
    metadata: { discordId: discordUser.id, discordUsername },
    ipAddress: getClientAddress(),
  });

  redirect(302, `/users/${steamId}?discord=linked`);
};
