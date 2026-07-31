/**
 * Typed helpers for DemosModule over Rama REST JSON.
 */

import { RamaClient, type AckLevel } from './client';

export const DEMOS_MODULE = 'mge.tf.rama.demos-module/DemosModule';
export const DEMO_DEPOT = '*demo-depot';

export type DemoAck = {
  ok: boolean;
  error?: string;
  demoId?: string;
  reportId?: string;
  status?: string;
};

export type DemoRecord = {
  matchId: string;
  playerSteamId: string;
  submittedBy: string;
  file: string;
  title: string;
  description: string;
  createdAt: string;
};

export type DemoReportRecord = {
  demoId: string;
  reportedBy: string;
  status: string;
  description: string;
  adminComments: string;
  adminId: string;
  reportedAt: string;
};

function asAck(topologyReturns: Record<string, unknown>): DemoAck {
  const raw = topologyReturns['demos'];
  if (raw && typeof raw === 'object') return raw as DemoAck;
  return { ok: false, error: 'missing-ack' };
}

export function createDemosClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: DEMOS_MODULE,
  });
}

export async function createDemo(
  client: RamaClient,
  event: {
    demoId: string;
    matchId: string;
    playerSteamId: string;
    submittedBy: string;
    file: string;
    title?: string;
    description?: string;
    createdAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<DemoAck> {
  return asAck(
    await client.append(
      DEMO_DEPOT,
      {
        type: 'create-demo',
        demoId: event.demoId,
        matchId: event.matchId,
        playerSteamId: event.playerSteamId,
        submittedBy: event.submittedBy,
        file: event.file,
        title: event.title ?? '',
        description: event.description ?? '',
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function reportDemo(
  client: RamaClient,
  event: {
    reportId: string;
    demoId: string;
    reportedBy: string;
    description: string;
    reportedAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<DemoAck> {
  return asAck(
    await client.append(
      DEMO_DEPOT,
      {
        type: 'report-demo',
        reportId: event.reportId,
        demoId: event.demoId,
        reportedBy: event.reportedBy,
        description: event.description,
        reportedAt: event.reportedAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function resolveReport(
  client: RamaClient,
  event: {
    reportId: string;
    status: 'REVIEW' | 'ACTION' | 'CLEAR';
    adminComments: string;
    adminId: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<DemoAck> {
  return asAck(await client.append(DEMO_DEPOT, { type: 'resolve-report', ...event }, ackLevel));
}

export async function getDemo(client: RamaClient, demoId: string): Promise<DemoRecord | null> {
  try {
    const v = await client.selectOne('$$demos', [demoId]);
    if (!v || typeof v !== 'object') return null;
    return v as DemoRecord;
  } catch {
    return null;
  }
}

export async function getDemoIdsForMatch(client: RamaClient, matchId: string): Promise<string[]> {
  try {
    const v = await client.selectOne('$$demos-by-match', [matchId]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getDemoReport(
  client: RamaClient,
  reportId: string,
): Promise<DemoReportRecord | null> {
  try {
    const v = await client.selectOne('$$demo-reports', [reportId]);
    if (!v || typeof v !== 'object') return null;
    return v as DemoReportRecord;
  } catch {
    return null;
  }
}

export async function getReportIdsByStatus(client: RamaClient, status: string): Promise<string[]> {
  try {
    const v = await client.selectOne('$$reports-by-status', [status]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getReportIdsForDemo(client: RamaClient, demoId: string): Promise<string[]> {
  try {
    const v = await client.selectOne('$$reports-by-demo', [demoId]);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

/** Numeric string id — form actions coerce demo/report ids with z.coerce.number(). */
export function nextDemoId(): string {
  return String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}

export function nextReportId(): string {
  return String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}
