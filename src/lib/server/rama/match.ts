/**
 * Typed helpers for the MatchModule spike over Rama REST JSON.
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
  status?: string;
};

export type CreateMatchEvent = {
  type: 'create-match';
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  seasonId: string;
  boGames: number;
  pool: string[];
  weekNo?: number;
  seasonNo?: number;
  arenaId?: string;
  matchDateTime?: string;
  matchTimezone?: string;
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
  return asAck(
    await client.append(
      MATCH_DEPOT,
      withLongs(
        {
          ...event,
          weekNo: event.weekNo ?? 0,
          seasonNo: event.seasonNo ?? 0,
          arenaId: event.arenaId ?? '',
          matchDateTime: event.matchDateTime ?? '',
          matchTimezone: event.matchTimezone ?? '',
        },
        ['boGames', 'weekNo', 'seasonNo'],
      ),
      ackLevel,
    ),
  );
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

/** @lintignore Used by upcoming admin schedule-edit cutover */
export async function setMatchSchedule(
  client: RamaClient,
  event: { matchId: string; matchDateTime?: string; matchTimezone?: string },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      {
        type: 'set-schedule',
        matchId: event.matchId,
        matchDateTime: event.matchDateTime ?? '',
        matchTimezone: event.matchTimezone ?? '',
      },
      ackLevel,
    ),
  );
}

/** @lintignore Used by upcoming dispute/status cutover */
export async function setMatchStatus(
  client: RamaClient,
  event: { matchId: string; status: 'UNPLAYED' | 'PLAYED' | 'DISPUTE' },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(await client.append(MATCH_DEPOT, { type: 'set-match-status', ...event }, ackLevel));
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

/** Match ids for a season week from $$matches-by-week. */
export async function getMatchIdsForWeek(
  client: RamaClient,
  seasonId: string,
  weekNo: number,
): Promise<string[]> {
  try {
    const v = await client.selectOne('$$matches-by-week', [`${seasonId}:${weekNo}`]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

/** Match ids for a team from $$matches-by-team. */
export async function getMatchIdsForTeam(client: RamaClient, teamId: string): Promise<string[]> {
  try {
    const v = await client.selectOne('$$matches-by-team', [teamId]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, string>);
  } catch {
    return [];
  }
}
