import { getDiscordBotToken, getDiscordGuildId } from '$lib/server/utils/env';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const MAX_ATTEMPTS = 5;
const MIN_RETRY_MS = 250;
const MAX_RETRY_MS = 5000;

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

export function nextMemberRoleIds(
  currentRoleIds: string[],
  desiredRoleIds: string[],
  managedRoleIds: Set<string>,
): string[] {
  const unmanaged = currentRoleIds.filter((roleId) => roleId && !managedRoleIds.has(roleId));
  const desired = desiredRoleIds.filter((roleId) => roleId && managedRoleIds.has(roleId));
  return [...new Set([...unmanaged, ...desired])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, payload: unknown): number {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, MIN_RETRY_MS), MAX_RETRY_MS);
    }
  }
  if (payload && typeof payload === 'object' && 'retry_after' in payload) {
    const seconds = Number((payload as { retry_after: unknown }).retry_after);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, MIN_RETRY_MS), MAX_RETRY_MS);
    }
  }
  return 1000;
}

function discordErrorMessage(status: number, payload: unknown): string {
  const apiMessage =
    payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : '';

  if (status === 403) {
    if (apiMessage && apiMessage !== 'Missing Permissions') return apiMessage;
    return 'The bot cannot manage that Discord role. Move the bot role above it in Server Settings → Roles.';
  }

  return apiMessage || `Discord request failed (${status})`;
}

async function discordFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new DiscordGuildError('Discord bot is not configured', 503);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(response, payload));
      continue;
    }

    if (!response.ok) {
      throw new DiscordGuildError(discordErrorMessage(response.status, payload), response.status);
    }

    return payload as T;
  }

  throw new DiscordGuildError('Discord rate limit exceeded', 429);
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

  const current = member.roles ?? [];
  const next = nextMemberRoleIds(current, desiredRoleIds, managedRoleIds);
  const currentSet = new Set(current);
  const unchanged =
    next.length === currentSet.size && next.every((roleId) => currentSet.has(roleId));
  if (unchanged) return 'ok';

  await discordFetch(`/guilds/${guildId}/members/${discordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ roles: next }),
  });

  return 'ok';
}
