/**
 * Typed helpers for DivisionsModule over Rama REST JSON.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';
import { ramaClientOpts } from './config';

export const DIVISIONS_MODULE = 'mge.tf.rama.divisions-module/DivisionsModule';
export const DIVISION_DEPOT = '*division-depot';

export type DivisionAck = {
  ok: boolean;
  error?: string;
  divisionId?: string;
};

function asAck(topologyReturns: Record<string, unknown>): DivisionAck {
  const raw = topologyReturns['divisions'];
  if (raw && typeof raw === 'object') return raw as DivisionAck;
  return { ok: false, error: 'missing-ack' };
}

export function createDivisionsClient(opts?: {
  conductorUrl?: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  const base = opts?.conductorUrl
    ? { conductorUrl: opts.conductorUrl, supervisorBaseUrl: opts.supervisorBaseUrl }
    : ramaClientOpts();
  return new RamaClient({ ...base, moduleName: DIVISIONS_MODULE });
}

export async function upsertDivision(
  client: RamaClient,
  event: {
    divisionId: string;
    name: string;
    regionId: string;
    signupCost?: number;
    sortOrder?: number;
  },
  ackLevel: AckLevel = 'ack',
): Promise<DivisionAck> {
  const payload: Record<string, unknown> = {
    type: 'upsert-division',
    divisionId: event.divisionId,
    name: event.name,
    regionId: event.regionId,
    signupCost: ramaLong(event.signupCost ?? 0),
    sortOrder: ramaLong(event.sortOrder ?? 0),
  };
  return asAck(await client.append(DIVISION_DEPOT, payload, ackLevel));
}

export async function getDivision(
  client: RamaClient,
  divisionId: string,
): Promise<{
  name: string;
  regionId: string;
  signupCost: number;
  sortOrder: number;
} | null> {
  try {
    const v = await client.selectOne('$$divisions', [divisionId]);
    if (!v || typeof v !== 'object') return null;
    return v as {
      name: string;
      regionId: string;
      signupCost: number;
      sortOrder: number;
    };
  } catch {
    return null;
  }
}

/**
 * Returns all division IDs for a given region from the $$division-ids-by-region index.
 * The outer key is regionId; inner keys are divisionIds (value = true).
 */
export async function getDivisionIdsByRegion(
  client: RamaClient,
  regionId: string,
): Promise<string[]> {
  try {
    const v = await client.selectOne('$$division-ids-by-region', [regionId]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}
