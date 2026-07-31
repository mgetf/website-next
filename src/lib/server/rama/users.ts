/**
 * Typed helpers for UsersModule over Rama REST JSON.
 *
 * Production auth still uses Postgres — import from here on cutover.
 *
 * @lintignore Spike user helpers; production auth still uses Postgres.
 */

import { RamaClient, type AckLevel } from './client';

export const USERS_MODULE = 'mge.tf.rama.users-module/UsersModule';
export const USER_DEPOT = '*user-depot';

export type UserAck = {
  ok: boolean;
  error?: string;
  steamId?: string;
  permissionLevel?: string;
  banStatus?: string;
  sessionVersion?: number;
  discordId?: string;
  takenBy?: string;
  type?: string;
};

function asAck(topologyReturns: Record<string, unknown>): UserAck {
  const raw = topologyReturns['users'];
  if (raw && typeof raw === 'object') return raw as UserAck;
  return { ok: false, error: 'missing-ack' };
}

export function createUsersClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: USERS_MODULE,
  });
}

export async function upsertProfile(
  client: RamaClient,
  event: { steamId: string; username: string; avatarUrl: string },
  ackLevel: AckLevel = 'ack',
): Promise<UserAck> {
  return asAck(await client.append(USER_DEPOT, { type: 'upsert-profile', ...event }, ackLevel));
}

export async function setPermission(
  client: RamaClient,
  event: { steamId: string; permissionLevel: 'GUEST' | 'MODERATOR' | 'ADMIN' },
  ackLevel: AckLevel = 'ack',
): Promise<UserAck> {
  return asAck(await client.append(USER_DEPOT, { type: 'set-permission', ...event }, ackLevel));
}

export async function setBan(
  client: RamaClient,
  event: { steamId: string; banStatus: 'NONE' | 'SUSPENDED' | 'BANNED' },
  ackLevel: AckLevel = 'ack',
): Promise<UserAck> {
  return asAck(await client.append(USER_DEPOT, { type: 'set-ban', ...event }, ackLevel));
}

export async function bumpSession(
  client: RamaClient,
  steamId: string,
  ackLevel: AckLevel = 'ack',
): Promise<UserAck> {
  return asAck(await client.append(USER_DEPOT, { type: 'bump-session', steamId }, ackLevel));
}

export async function linkDiscord(
  client: RamaClient,
  event: { steamId: string; discordId: string },
  ackLevel: AckLevel = 'ack',
): Promise<UserAck> {
  return asAck(await client.append(USER_DEPOT, { type: 'link-discord', ...event }, ackLevel));
}

export async function getUser(
  client: RamaClient,
  steamId: string,
): Promise<Record<string, unknown> | null> {
  try {
    return (await client.selectOne('$$users', [steamId])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getSessionVersion(
  client: RamaClient,
  steamId: string,
): Promise<number | null> {
  try {
    const v = await client.selectOne('$$users', [steamId, 'sessionVersion']);
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}
