/**
 * Typed helpers for the MatchModule spike over Rama REST JSON.
 *
 * Not yet wired into SvelteKit routes — Postgres still serves production paths.
 * Import from here when cutting match writes over to Rama.
 *
 * @lintignore Spike match helpers; production routes still use Postgres.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';

export const MATCH_MODULE = 'mge.tf.rama.match-module/MatchModule';
export const MATCH_DEPOT = '*match-depot';

export type MatchAck = {
  ok: boolean;
  error?: string;
  matchId?: string;
  winnerId?: string;
  homeScore?: number;
  awayScore?: number;
  banned?: string;
  turn?: number;
  expectedTeamId?: string;
  type?: string;
  boGames?: number;
};

export type CreateMatchEvent = {
  type: 'create-match';
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  seasonId: string;
  boGames: number;
  pool: string[];
};

export type BanMapEvent = {
  type: 'ban-map';
  matchId: string;
  teamId: string;
  arenaId: string;
};

export type SubmitScoreEvent = {
  type: 'submit-score';
  matchId: string;
  homeScore: number;
  awayScore: number;
};

function asAck(topologyReturns: Record<string, unknown>): MatchAck {
  const raw = topologyReturns['matches'];
  if (raw && typeof raw === 'object') return raw as MatchAck;
  return { ok: false, error: 'missing-ack', ...(raw as object) };
}

/** JSON-encode numeric fields Rama should treat as longs. */
function withLongs<T extends Record<string, unknown>>(
  event: T,
  keys: (keyof T)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...event };
  for (const k of keys) {
    const v = event[k];
    if (typeof v === 'number') out[k as string] = ramaLong(v);
  }
  return out;
}

export function createMatchClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: MATCH_MODULE,
  });
}

export async function createMatch(
  client: RamaClient,
  event: CreateMatchEvent,
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(await client.append(MATCH_DEPOT, withLongs(event, ['boGames']), ackLevel));
}

export async function banMap(
  client: RamaClient,
  event: BanMapEvent,
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(await client.append(MATCH_DEPOT, event, ackLevel));
}

export async function submitScore(
  client: RamaClient,
  event: SubmitScoreEvent,
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(MATCH_DEPOT, withLongs(event, ['homeScore', 'awayScore']), ackLevel),
  );
}

export async function getMatch(
  client: RamaClient,
  matchId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const v = await client.selectOne('$$matches', [matchId]);
    return (v as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export async function getMatchStatus(client: RamaClient, matchId: string): Promise<string | null> {
  try {
    return (await client.selectOne('$$matches', [matchId, 'status'])) as string;
  } catch {
    return null;
  }
}

export async function getMapBanTurn(client: RamaClient, matchId: string): Promise<number | null> {
  try {
    return (await client.selectOne('$$map-bans', [matchId, 'turn'])) as number;
  } catch {
    return null;
  }
}

export async function getTeamWins(client: RamaClient, teamId: string): Promise<number> {
  try {
    const v = await client.selectOne('$$team-stats', [teamId, 'wins']);
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

/** Remaining arenas in the ban pool. */
export async function getRemainingArenas(client: RamaClient, matchId: string): Promise<string[]> {
  const v = await client.selectOne('$$map-bans', [matchId, 'remaining']);
  if (Array.isArray(v)) return v as string[];
  if (v && typeof v === 'object') return Object.keys(v as object);
  return [];
}
