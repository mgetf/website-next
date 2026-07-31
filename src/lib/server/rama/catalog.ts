/**
 * Typed helpers for CatalogModule over Rama REST JSON.
 *
 * @lintignore Spike catalog helpers; production regions/formats still use Postgres.
 */

import { RamaClient, type AckLevel } from './client';

export const CATALOG_MODULE = 'mge.tf.rama.catalog-module/CatalogModule';
export const CATALOG_DEPOT = '*catalog-depot';

export type CatalogAck = {
  ok: boolean;
  error?: string;
  regionId?: string;
  formatId?: string;
  seasonId?: string;
  code?: string;
  hidden?: boolean;
  type?: string;
};

function asAck(topologyReturns: Record<string, unknown>): CatalogAck {
  const raw = topologyReturns['catalog'];
  if (raw && typeof raw === 'object') return raw as CatalogAck;
  return { ok: false, error: 'missing-ack' };
}

export function createCatalogClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: CATALOG_MODULE,
  });
}

export async function upsertRegion(
  client: RamaClient,
  event: {
    regionId: string;
    name: string;
    hidden?: boolean;
    currencySymbol?: string;
    currencyCode?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<CatalogAck> {
  return asAck(
    await client.append(
      CATALOG_DEPOT,
      {
        type: 'upsert-region',
        regionId: event.regionId,
        name: event.name,
        hidden: event.hidden ?? false,
        currencySymbol: event.currencySymbol ?? '',
        currencyCode: event.currencyCode ?? '',
      },
      ackLevel,
    ),
  );
}

export async function setRegionHidden(
  client: RamaClient,
  event: { regionId: string; hidden: boolean },
  ackLevel: AckLevel = 'ack',
): Promise<CatalogAck> {
  return asAck(
    await client.append(CATALOG_DEPOT, { type: 'set-region-hidden', ...event }, ackLevel),
  );
}

export async function upsertFormat(
  client: RamaClient,
  event: { formatId: string; name: string; code: string },
  ackLevel: AckLevel = 'ack',
): Promise<CatalogAck> {
  return asAck(await client.append(CATALOG_DEPOT, { type: 'upsert-format', ...event }, ackLevel));
}

export async function setActiveSignup(
  client: RamaClient,
  event: { regionId: string; formatId: string; seasonId: string },
  ackLevel: AckLevel = 'ack',
): Promise<CatalogAck> {
  return asAck(
    await client.append(CATALOG_DEPOT, { type: 'set-active-signup', ...event }, ackLevel),
  );
}

export async function getRegion(
  client: RamaClient,
  regionId: string,
): Promise<{
  name: string;
  hidden: boolean;
  currencySymbol: string;
  currencyCode: string;
} | null> {
  try {
    const v = await client.selectOne('$$regions', [regionId]);
    if (!v || typeof v !== 'object') return null;
    return v as {
      name: string;
      hidden: boolean;
      currencySymbol: string;
      currencyCode: string;
    };
  } catch {
    return null;
  }
}

export async function getFormat(
  client: RamaClient,
  formatId: string,
): Promise<{ name: string; code: string } | null> {
  try {
    const v = await client.selectOne('$$formats', [formatId]);
    if (!v || typeof v !== 'object') return null;
    return v as { name: string; code: string };
  } catch {
    return null;
  }
}

export async function getFormatIdByCode(client: RamaClient, code: string): Promise<string | null> {
  try {
    return (await client.selectOne('$$format-by-code', [code])) as string;
  } catch {
    return null;
  }
}

export async function getActiveSignupSeason(
  client: RamaClient,
  regionId: string,
  formatId: string,
): Promise<string | null> {
  try {
    return (await client.selectOne('$$active-signup', [regionId, formatId])) as string;
  } catch {
    return null;
  }
}

/**
 * Returns all region IDs tracked in the $$region-ids index.
 * The outer key "all" holds a map of {regionId -> true}.
 */
export async function getRegionIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$region-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}
