/**
 * Typed helpers for SeasonsModule over Rama REST JSON.
 *
 * @lintignore Spike season helpers; production admin seasons still use Postgres.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';

export const SEASONS_MODULE = 'mge.tf.rama.seasons-module/SeasonsModule';
export const SEASON_DEPOT = '*season-depot';

export type SeasonAck = {
  ok: boolean;
  error?: string;
  seasonId?: string;
  type?: string;
};

export type SeasonRecord = {
  seasonNum: number;
  numWeeks: number;
  regionId: string;
  formatId: string;
  signupsOpen: boolean;
  rosterLocked: boolean;
  paymentRequired: boolean;
  matchWeek: number;
  matchDeadline: string;
  info: string;
};

function asAck(topologyReturns: Record<string, unknown>): SeasonAck {
  const raw = topologyReturns['seasons'];
  if (raw && typeof raw === 'object') return raw as SeasonAck;
  return { ok: false, error: 'missing-ack' };
}

function withLongs(event: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out = { ...event };
  for (const k of keys) {
    if (typeof out[k] === 'number') out[k] = ramaLong(out[k] as number);
  }
  return out;
}

export function createSeasonsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: SEASONS_MODULE,
  });
}

export async function createSeason(
  client: RamaClient,
  event: {
    seasonId: string;
    seasonNum: number;
    numWeeks: number;
    regionId: string;
    formatId: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<SeasonAck> {
  return asAck(
    await client.append(
      SEASON_DEPOT,
      withLongs({ type: 'create-season', ...event }, ['seasonNum', 'numWeeks']),
      ackLevel,
    ),
  );
}

export async function setSeasonFlags(
  client: RamaClient,
  event: {
    seasonId: string;
    signupsOpen: boolean;
    rosterLocked: boolean;
    paymentRequired: boolean;
  },
  ackLevel: AckLevel = 'ack',
): Promise<SeasonAck> {
  return asAck(await client.append(SEASON_DEPOT, { type: 'set-flags', ...event }, ackLevel));
}

export async function setSeasonSchedule(
  client: RamaClient,
  event: {
    seasonId: string;
    matchWeek: number;
    matchDeadline?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<SeasonAck> {
  return asAck(
    await client.append(
      SEASON_DEPOT,
      withLongs({ type: 'set-schedule', ...event }, ['matchWeek']),
      ackLevel,
    ),
  );
}

export async function setSeasonInfo(
  client: RamaClient,
  event: { seasonId: string; info: string },
  ackLevel: AckLevel = 'ack',
): Promise<SeasonAck> {
  return asAck(await client.append(SEASON_DEPOT, { type: 'set-info', ...event }, ackLevel));
}

export async function updateSeason(
  client: RamaClient,
  event: { seasonId: string; numWeeks: number },
  ackLevel: AckLevel = 'ack',
): Promise<SeasonAck> {
  return asAck(
    await client.append(
      SEASON_DEPOT,
      withLongs({ type: 'update-season', ...event }, ['numWeeks']),
      ackLevel,
    ),
  );
}

export async function getSeason(
  client: RamaClient,
  seasonId: string,
): Promise<SeasonRecord | null> {
  try {
    const v = await client.selectOne('$$seasons', [seasonId]);
    if (!v || typeof v !== 'object') return null;
    return v as SeasonRecord;
  } catch {
    return null;
  }
}

export async function getSeasonSignupsOpen(
  client: RamaClient,
  seasonId: string,
): Promise<boolean | null> {
  try {
    return (await client.selectOne('$$seasons', [seasonId, 'signupsOpen'])) as boolean;
  } catch {
    return null;
  }
}

export async function lookupSeasonId(
  client: RamaClient,
  regionId: string,
  formatId: string,
  seasonNum: number,
): Promise<string | null> {
  try {
    return (await client.selectOne('$$season-index', [
      regionId,
      formatId,
      String(seasonNum),
    ])) as string;
  } catch {
    return null;
  }
}
