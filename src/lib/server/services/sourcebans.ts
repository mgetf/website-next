import { getSourcebansApiToken, getSourcebansApiUrl } from '$lib/server/utils/env';

export class SourcebansError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SourcebansError';
  }
}

export type SourcebansWebGroup = {
  id: number;
  name: string;
  flags: number;
};

export type SourcebansServerGroup = {
  id: number;
  name: string;
  flags: string;
  immunity: number;
};

export type SourcebansGroups = {
  web: SourcebansWebGroup[];
  server: SourcebansServerGroup[];
};

export type SourcebansServer = {
  id: number;
  ip: string;
  port: number;
  enabled: boolean;
  hostname: string | null;
};

export type SourcebansAdminWrite = {
  name: string;
  server_group_id?: number | null;
  web_group_id?: number | null;
  server_ids?: number[];
  immunity?: number;
  email?: string;
};

export type SourcebansAdmin = {
  id: number;
  name: string;
  steam64: string;
  enabled: boolean;
};

export function isSourcebansConfigured(): boolean {
  return getSourcebansApiUrl().length > 0 && getSourcebansApiToken().length > 0;
}

export function sourcebansApiBase(url = getSourcebansApiUrl()): string {
  const trimmed = url.replace(/\/$/, '');
  if (!trimmed) return '';
  if (/\/api\/v1(\.php)?$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api/v1`;
}

type SourcebansEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; field?: string };
};

async function sourcebansFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; status: number }> {
  const base = sourcebansApiBase();
  const token = getSourcebansApiToken();
  if (!base || !token) {
    throw new SourcebansError('SourceBans is not configured', 503, 'not_configured');
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });

  let payload: SourcebansEnvelope<T> = {};
  try {
    payload = (await response.json()) as SourcebansEnvelope<T>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.error?.message || `SourceBans request failed (${response.status})`;
    throw new SourcebansError(message, response.status, payload.error?.code);
  }

  return { data: payload.data as T, status: response.status };
}

export async function listSourcebansGroups(): Promise<SourcebansGroups> {
  const { data } = await sourcebansFetch<SourcebansGroups>('/groups?per_page=100');
  return {
    web: data?.web ?? [],
    server: data?.server ?? [],
  };
}

export async function listSourcebansServers(): Promise<SourcebansServer[]> {
  const servers: SourcebansServer[] = [];
  let page = 1;
  for (;;) {
    const { data } = await sourcebansFetch<
      Array<{
        id: number;
        ip: string;
        port: number;
        enabled: boolean;
        query?: { hostname?: string } | null;
      }>
    >(`/servers?per_page=100&page=${page}&enabled=true`);
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      servers.push({
        id: row.id,
        ip: row.ip,
        port: row.port,
        enabled: row.enabled,
        hostname: row.query?.hostname ?? null,
      });
    }
    if (rows.length < 100) break;
    page += 1;
    if (page > 20) break;
  }
  return servers;
}

export async function upsertSourcebansAdmin(
  steam64: string,
  body: SourcebansAdminWrite,
): Promise<SourcebansAdmin> {
  const { data } = await sourcebansFetch<SourcebansAdmin>(
    `/admins/${encodeURIComponent(steam64)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
  return data;
}

export async function deactivateSourcebansAdmin(steam64: string, reason: string): Promise<void> {
  try {
    await sourcebansFetch(`/admins/${encodeURIComponent(steam64)}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    if (err instanceof SourcebansError && err.status === 404) return;
    throw err;
  }
}
