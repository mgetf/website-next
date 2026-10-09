import { redirect, error, isHttpError, isRedirect, type RequestHandler } from '@sveltejs/kit';
import {
  DiscordRateLimitError,
  exchangeDiscordCode,
  verifyDiscordOAuthState,
  formatDiscordUsername,
  getDiscordAvatarUrl,
} from '$lib/server/auth/discord';
import { requireAuth } from '$lib/server/auth/permissions';
import { linkDiscordAccount } from '$lib/server/services/users';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

function profileErrorRedirect(
  steamId: string,
  code: string,
  retryAfterSeconds?: number | null,
): never {
  const params = new URLSearchParams({ error: code });
  if (retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    params.set('retry', String(Math.ceil(retryAfterSeconds)));
  }
  redirect(302, `/users/${steamId}?${params.toString()}`);
}

export const GET: RequestHandler = async ({ url, request, cookies, locals, getClientAddress }) => {
  requireAuth(locals.user);
  const steamId = locals.user.steamId;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    console.error('[Discord OAuth] User denied or error:', oauthError);
    profileErrorRedirect(steamId, 'discord_auth_cancelled');
  }

  if (!code || !state) {
    error(400, 'Missing code or state parameter');
  }

  let discordUser;

  try {
    verifyDiscordOAuthState(state, cookies, steamId);
    discordUser = await exchangeDiscordCode(code, request);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof DiscordRateLimitError) {
      profileErrorRedirect(steamId, 'discord_rate_limited', err.retryAfterSeconds);
    }
    console.error('[Discord OAuth] Callback failed:', err);
    profileErrorRedirect(steamId, 'discord_link_failed');
  }

  const discordUsername = formatDiscordUsername(discordUser);
  const discordAvatar = getDiscordAvatarUrl(discordUser);

  try {
    await linkDiscordAccount(discordUser.id, discordUsername, discordAvatar, steamId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (isHttpError(err) && err.status === 409) {
      profileErrorRedirect(steamId, 'discord_already_linked');
    }
    console.error('[Discord OAuth] Link failed:', err);
    profileErrorRedirect(steamId, 'discord_link_failed');
  }

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
