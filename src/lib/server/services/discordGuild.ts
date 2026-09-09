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

export type DiscordGuildMemberSnapshot = {
  discordId: string;
  username: string;
  displayName: string;
  bot: boolean;
  roleIds: string[];
};

export type OrphanManagedRoleHolder = {
  discordId: string;
  username: string;
  displayName: string;
  roleIds: string[];
  roleNames: string[];
};

export type DiscordApiUser = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
};

export type DiscordUserLookupResult =
  { status: 'ok'; user: DiscordApiUser } | { status: 'not_configured' } | { status: 'not_found' };

const MEMBER_PAGE_SIZE = 1000;
const MAX_MEMBER_PAGES = 20;

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

export function filterOrphanManagedRoleHolders(
  members: DiscordGuildMemberSnapshot[],
  staffDiscordIds: ReadonlySet<string>,
  managedRoleIds: ReadonlySet<string>,
  roleNamesById: ReadonlyMap<string, string>,
): OrphanManagedRoleHolder[] {
  const holders: OrphanManagedRoleHolder[] = [];
  for (const member of members) {
    if (member.bot) continue;
    if (staffDiscordIds.has(member.discordId)) continue;
    const held = [...new Set(member.roleIds.filter((roleId) => managedRoleIds.has(roleId)))];
    if (held.length === 0) continue;
    holders.push({
      discordId: member.discordId,
      username: member.username,
      displayName: member.displayName,
      roleIds: held,
      roleNames: held.map((roleId) => roleNamesById.get(roleId) ?? roleId),
    });
  }
  return holders.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    if (/missing access/i.test(apiMessage)) {
      return 'Cannot list Discord members. Enable Server Members Intent for the bot.';
    }
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

export async function listDiscordGuildMembers(): Promise<DiscordGuildMemberSnapshot[]> {
  const guildId = getDiscordGuildId();
  if (!guildId) {
    throw new DiscordGuildError('Discord guild is not configured', 503);
  }

  const members: DiscordGuildMemberSnapshot[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_MEMBER_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(MEMBER_PAGE_SIZE) });
    if (after) query.set('after', after);

    const rows = await discordFetch<
      Array<{
        nick?: string | null;
        roles?: string[];
        user?: {
          id?: string;
          username?: string;
          global_name?: string | null;
          bot?: boolean;
        };
      }>
    >(`/guilds/${guildId}/members?${query.toString()}`);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const user = row.user;
      const discordId = user?.id;
      if (!discordId) continue;
      const username = user.username || discordId;
      members.push({
        discordId,
        username,
        displayName: row.nick || user.global_name || username,
        bot: Boolean(user.bot),
        roleIds: row.roles ?? [],
      });
    }

    if (rows.length < MEMBER_PAGE_SIZE) break;
    const lastId = rows[rows.length - 1]?.user?.id;
    if (!lastId) break;
    after = lastId;
  }

  return members;
}

export async function lookupDiscordUser(discordId: string): Promise<DiscordUserLookupResult> {
  if (!getDiscordBotToken()) {
    return { status: 'not_configured' };
  }

  try {
    const user = await discordFetch<DiscordApiUser>(`/users/${discordId}`);
    return { status: 'ok', user };
  } catch (err) {
    if (err instanceof DiscordGuildError && (err.status === 404 || err.status === 400)) {
      return { status: 'not_found' };
    }
    throw err;
  }
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
