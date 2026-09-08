import { getDiscordBotToken, getDiscordGuildId } from '$lib/server/utils/env';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class DiscordGuildError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DiscordGuildError';
  }
}

export type DiscordGuildRole = {
  id: string;
  name: string;
  managed: boolean;
  position: number;
};

export function isDiscordGuildConfigured(): boolean {
  return getDiscordBotToken().length > 0 && getDiscordGuildId().length > 0;
}

async function discordFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new DiscordGuildError('Discord bot is not configured', 503);
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: 'application/json',
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `Discord request failed (${response.status})`;
    throw new DiscordGuildError(message, response.status);
  }

  return payload as T;
}

export async function listDiscordGuildRoles(): Promise<DiscordGuildRole[]> {
  const guildId = getDiscordGuildId();
  if (!guildId) {
    throw new DiscordGuildError('Discord guild is not configured', 503);
  }

  const roles = await discordFetch<
    Array<{ id: string; name: string; managed?: boolean; position?: number }>
  >(`/guilds/${guildId}/roles`);

  return (roles ?? [])
    .filter((role) => role.id !== guildId && !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      managed: Boolean(role.managed),
      position: role.position ?? 0,
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
}

export async function syncDiscordMemberRoles(
  discordId: string,
  desiredRoleIds: string[],
  managedRoleIds: Set<string>,
): Promise<'ok' | 'not_in_guild'> {
  const guildId = getDiscordGuildId();
  if (!guildId) {
    throw new DiscordGuildError('Discord guild is not configured', 503);
  }

  let member: { roles?: string[] };
  try {
    member = await discordFetch<{ roles?: string[] }>(`/guilds/${guildId}/members/${discordId}`);
  } catch (err) {
    if (err instanceof DiscordGuildError && err.status === 404) {
      return 'not_in_guild';
    }
    throw err;
  }

  const current = new Set(member.roles ?? []);
  const desired = new Set(desiredRoleIds);

  for (const roleId of desired) {
    if (!current.has(roleId)) {
      await discordFetch(`/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
        method: 'PUT',
      });
    }
  }

  for (const roleId of current) {
    if (managedRoleIds.has(roleId) && !desired.has(roleId)) {
      await discordFetch(`/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
        method: 'DELETE',
      });
    }
  }

  return 'ok';
}
