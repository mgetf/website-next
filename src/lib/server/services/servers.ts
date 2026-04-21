/**
 * Panel Servers Service
 *
 * Fetches live game server data from the mge-servers-panel public API.
 * Maintains an in-memory 15-second TTL cache so bursts of page loads
 * do not hammer the upstream endpoint.
 */

import { z } from 'zod';
import { env } from '$env/dynamic/private';
import type { PublicGameServer, ServersPageData } from '$lib/types/servers';

// ---------------------------------------------------------------------------
// Zod schema — validates the panel response shape
// ---------------------------------------------------------------------------

const ServerStatusSchema = z.enum(['running', 'stopped', 'restarting', 'missing', 'unknown']);

const PublicGameServerSchema = z.object({
  regionSlug: z.string(),
  regionName: z.string(),
  regionFlag: z.string().optional(),
  hostSlug: z.string(),
  slot: z.number().int(),
  host: z.string(),
  port: z.number().int(),
  connect: z.string(),
  displayName: z.string(),
  map: z.string(),
  label: z.string(),
  elo: z.boolean(),
  maxPlayers: z.number().int(),
  playerCount: z.number().int(),
  status: ServerStatusSchema,
  uptime: z.string(),
});

const PublicServersResponseSchema = z.object({
  servers: z.array(PublicGameServerSchema),
  count: z.number().int(),
  generatedAt: z.string(),
});

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 15_000;
const STALE_FALLBACK_MS = 120_000;

interface CacheEntry {
  servers: PublicGameServer[];
  count: number;
  generatedAt: string;
  cachedAt: number;
}

let cache: CacheEntry | null = null;

function getPanelBaseUrl(): string {
  return (env.MGE_PANEL_URL ?? 'https://panel.mge.tf').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function getPublicServers(): Promise<ServersPageData> {
  const now = Date.now();

  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return {
      servers: cache.servers,
      count: cache.count,
      generatedAt: cache.generatedAt,
      error: null,
    };
  }

  const url = `${getPanelBaseUrl()}/api/public/servers`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
      headers: {
        'User-Agent': 'mge.tf-site/1.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Panel responded with HTTP ${response.status}`);
    }

    const raw = await response.json();
    const parsed = PublicServersResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new Error(`Unexpected panel response shape: ${parsed.error.message}`);
    }

    cache = {
      servers: parsed.data.servers,
      count: parsed.data.count,
      generatedAt: parsed.data.generatedAt,
      cachedAt: now,
    };

    return {
      servers: cache.servers,
      count: cache.count,
      generatedAt: cache.generatedAt,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[servers] Failed to fetch from panel: ${message}`);

    if (cache && now - cache.cachedAt < STALE_FALLBACK_MS) {
      return {
        servers: cache.servers,
        count: cache.count,
        generatedAt: cache.generatedAt,
        error: 'Could not reach the game server panel. Showing last known data.',
      };
    }

    return {
      servers: [],
      count: 0,
      generatedAt: new Date().toISOString(),
      error: 'Could not reach the game server panel. Please try again later.',
    };
  }
}
