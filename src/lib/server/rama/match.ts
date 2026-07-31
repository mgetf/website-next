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
  commId?: string;
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

export type MatchCommRecord = {
  owner: string;
  content: string;
  createdAt: string;
  reschedule: string;
  rescheduleStatus: number;
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
  actionType?: 'ban' | 'pick';
};

export type SubmitScoreEvent = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  submittedBy?: string;
  submittedAt?: string;
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
  return asAck(
    await client.append(
      MATCH_DEPOT,
      {
        type: 'ban-map',
        matchId: event.matchId,
        teamId: event.teamId,
        arenaId: event.arenaId,
        actionType: event.actionType ?? 'ban',
      },
      ackLevel,
    ),
  );
}

export async function submitScore(
  client: RamaClient,
  event: SubmitScoreEvent,
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      withLongs(
        {
          type: 'submit-score',
          matchId: event.matchId,
          homeScore: event.homeScore,
          awayScore: event.awayScore,
          submittedBy: event.submittedBy ?? '',
          submittedAt: event.submittedAt ?? new Date().toISOString(),
        },
        ['homeScore', 'awayScore'],
      ),
      ackLevel,
    ),
  );
}

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

export async function setMatchArena(
  client: RamaClient,
  event: { matchId: string; arenaId: string },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      { type: 'set-arena', matchId: event.matchId, arenaId: event.arenaId },
      ackLevel,
    ),
  );
}

export async function setMatchStatus(
  client: RamaClient,
  event: { matchId: string; status: 'UNPLAYED' | 'PLAYED' | 'DISPUTE' },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(await client.append(MATCH_DEPOT, { type: 'set-match-status', ...event }, ackLevel));
}

export async function postComm(
  client: RamaClient,
  event: {
    matchId: string;
    commId: string;
    owner: string;
    content: string;
    createdAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      {
        type: 'post-comm',
        matchId: event.matchId,
        commId: event.commId,
        owner: event.owner,
        content: event.content,
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function requestReschedule(
  client: RamaClient,
  event: {
    matchId: string;
    commId: string;
    owner: string;
    content: string;
    reschedule: string;
    createdAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      {
        type: 'request-reschedule',
        matchId: event.matchId,
        commId: event.commId,
        owner: event.owner,
        content: event.content,
        reschedule: event.reschedule,
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function respondReschedule(
  client: RamaClient,
  event: {
    matchId: string;
    commId: string;
    response: 'accept' | 'deny' | 'cancel';
    respondedBy: string;
    responseCommId: string;
    responseContent: string;
    createdAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<MatchAck> {
  return asAck(
    await client.append(
      MATCH_DEPOT,
      {
        type: 'respond-reschedule',
        matchId: event.matchId,
        commId: event.commId,
        response: event.response,
        respondedBy: event.respondedBy,
        responseCommId: event.responseCommId,
        responseContent: event.responseContent,
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
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

export type MapBanRecord = {
  turn: number;
  homeTeamId: string;
  awayTeamId: string;
  remaining: string[] | Record<string, unknown>;
  actions: Array<{ teamId: string; arenaId: string; actionType: string }>;
  banPhaseComplete: boolean;
  boSeries: number;
};

/** Full $$map-bans row for a match, or null if absent. */
export async function getMapBan(client: RamaClient, matchId: string): Promise<MapBanRecord | null> {
  try {
    const v = await client.selectOne('$$map-bans', [matchId]);
    if (!v || typeof v !== 'object') return null;
    return v as MapBanRecord;
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

export async function getTeamStats(
  client: RamaClient,
  teamId: string,
): Promise<{ wins: number; losses: number; points: number }> {
  try {
    const v = await client.selectOne('$$team-stats', [teamId]);
    if (!v || typeof v !== 'object') return { wins: 0, losses: 0, points: 0 };
    const row = v as Record<string, unknown>;
    return {
      wins: typeof row.wins === 'number' ? row.wins : 0,
      losses: typeof row.losses === 'number' ? row.losses : 0,
      points: typeof row.points === 'number' ? row.points : 0,
    };
  } catch {
    return { wins: 0, losses: 0, points: 0 };
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
    const v = await client.selectSubindexedMap('$$matches-by-team', teamId);
    return Object.keys(v);
  } catch {
    return [];
  }
}

/** Match ids for a status from $$matches-by-status. */
export async function getMatchIdsByStatus(
  client: RamaClient,
  status: 'UNPLAYED' | 'PLAYED' | 'DISPUTE',
): Promise<string[]> {
  try {
    const v = await client.selectOne('$$matches-by-status', [status]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getMatchComms(
  client: RamaClient,
  matchId: string,
): Promise<Record<string, MatchCommRecord>> {
  try {
    return (await client.selectSubindexedMap('$$match-comms', matchId)) as Record<
      string,
      MatchCommRecord
    >;
  } catch {
    return {};
  }
}

export async function getMatchComm(
  client: RamaClient,
  matchId: string,
  commId: string,
): Promise<MatchCommRecord | null> {
  try {
    const v = await client.selectOne('$$match-comms', [matchId, commId]);
    if (!v || typeof v !== 'object') return null;
    return v as MatchCommRecord;
  } catch {
    return null;
  }
}

export async function getPendingRescheduleCommId(
  client: RamaClient,
  matchId: string,
): Promise<string | null> {
  try {
    const v = await client.selectOne('$$pending-reschedule', [matchId]);
    if (typeof v !== 'string' || v.length === 0) return null;
    return v;
  } catch {
    return null;
  }
}

export function nextCommId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
