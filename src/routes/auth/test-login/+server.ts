/**
 * Dev/test auth bypass — creates or reuses a user and sets a real session cookie.
 * Disabled in production.
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSession, sanitizeRedirectUrl } from '$lib/server/session';
import { getAppEnvironment } from '$lib/server/utils/environment';
import { upsertTestLoginUser } from '$lib/server/services/users';
import { UserRole, BanStatus, type SessionUser } from '$lib/types/user';
import { z } from 'zod';

const steamIdSchema = z
  .string()
  .regex(/^7656119\d{10}$/, 'steamId must be a 17-digit SteamID64 starting with 7656119');

const roleSchema = z.enum(['GUEST', 'MODERATOR', 'ADMIN']).default('GUEST');

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (getAppEnvironment() === 'production') {
    throw redirect(302, '/');
  }

  const steamIdResult = steamIdSchema.safeParse(url.searchParams.get('steamId'));
  if (!steamIdResult.success) {
    return new Response('Invalid or missing steamId query param', { status: 400 });
  }

  const steamId = steamIdResult.data;
  const role = roleSchema.parse(url.searchParams.get('role') ?? 'GUEST');
  const username = url.searchParams.get('username')?.trim() || `Test ${steamId.slice(-4)}`;
  const redirectTo = sanitizeRedirectUrl(url.searchParams.get('redirect') || '/');

  const user = await upsertTestLoginUser({ steamId, username, role });

  const sessionUser: SessionUser = {
    steamId: user.steamId,
    steamUsername: user.steamUsername,
    steamAvatar: user.steamAvatar ?? '',
    permissionLevel: user.permissionLevel as UserRole,
    banStatus: user.banStatus as BanStatus,
    sessionVersion: user.sessionVersion,
  };

  setSession(cookies, sessionUser);

  throw redirect(302, redirectTo);
};
