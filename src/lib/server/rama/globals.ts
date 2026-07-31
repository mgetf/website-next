/**
 * Typed helpers for GlobalsModule (announcements + audit log) over Rama REST JSON.
 */

import { RamaClient, type AckLevel } from './client';

export const GLOBALS_MODULE = 'mge.tf.rama.globals-module/GlobalsModule';
export const GLOBALS_DEPOT = '*globals-depot';

export type GlobalsAck = {
  ok: boolean;
  error?: string;
  announcementId?: string;
  auditId?: string;
  visible?: boolean;
  type?: string;
};

export type AnnouncementRecord = {
  content: string;
  visible: boolean;
  createdAt: string;
};

export type AuditRecord = {
  actorId: string;
  actorRole: string;
  category: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: string;
  ipAddress: string;
  createdAt: string;
};

function asAck(topologyReturns: Record<string, unknown>): GlobalsAck {
  const raw = topologyReturns['globals'];
  if (raw && typeof raw === 'object') return raw as GlobalsAck;
  return { ok: false, error: 'missing-ack' };
}

export function createGlobalsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: GLOBALS_MODULE,
  });
}

export async function createAnnouncement(
  client: RamaClient,
  event: { announcementId: string; content: string; createdAt?: string },
  ackLevel: AckLevel = 'ack',
): Promise<GlobalsAck> {
  return asAck(
    await client.append(
      GLOBALS_DEPOT,
      {
        type: 'create-announcement',
        announcementId: event.announcementId,
        content: event.content,
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function updateAnnouncement(
  client: RamaClient,
  event: { announcementId: string; content: string },
  ackLevel: AckLevel = 'ack',
): Promise<GlobalsAck> {
  return asAck(
    await client.append(GLOBALS_DEPOT, { type: 'update-announcement', ...event }, ackLevel),
  );
}

export async function setAnnouncementVisible(
  client: RamaClient,
  event: { announcementId: string; visible: boolean },
  ackLevel: AckLevel = 'ack',
): Promise<GlobalsAck> {
  return asAck(
    await client.append(GLOBALS_DEPOT, { type: 'set-announcement-visible', ...event }, ackLevel),
  );
}

export async function deleteAnnouncement(
  client: RamaClient,
  announcementId: string,
  ackLevel: AckLevel = 'ack',
): Promise<GlobalsAck> {
  return asAck(
    await client.append(GLOBALS_DEPOT, { type: 'delete-announcement', announcementId }, ackLevel),
  );
}

export async function appendAudit(
  client: RamaClient,
  event: {
    auditId: string;
    actorId?: string | null;
    actorRole?: string | null;
    category: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: string | null;
    ipAddress?: string | null;
    createdAt?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<GlobalsAck> {
  return asAck(
    await client.append(
      GLOBALS_DEPOT,
      {
        type: 'append-audit',
        auditId: event.auditId,
        actorId: event.actorId ?? '',
        actorRole: event.actorRole ?? '',
        category: event.category,
        action: event.action,
        targetType: event.targetType ?? '',
        targetId: event.targetId ?? '',
        metadata: event.metadata ?? '',
        ipAddress: event.ipAddress ?? '',
        createdAt: event.createdAt ?? new Date().toISOString(),
      },
      ackLevel,
    ),
  );
}

export async function getAnnouncement(
  client: RamaClient,
  announcementId: string,
): Promise<AnnouncementRecord | null> {
  try {
    const v = await client.selectOne('$$announcements', [announcementId]);
    if (!v || typeof v !== 'object') return null;
    return v as AnnouncementRecord;
  } catch {
    return null;
  }
}

export async function getAnnouncementIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$announcement-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getVisibleAnnouncementIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$visible-announcement-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

export async function getAudit(client: RamaClient, auditId: string): Promise<AuditRecord | null> {
  try {
    const v = await client.selectOne('$$audit-logs', [auditId]);
    if (!v || typeof v !== 'object') return null;
    return v as AuditRecord;
  } catch {
    return null;
  }
}

/** Returns auditId → createdAt map from $$audit-ids. */
export async function getAuditIdMap(client: RamaClient): Promise<Record<string, string>> {
  try {
    const v = await client.selectOne('$$audit-ids', ['all']);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, string>;
  } catch {
    return {};
  }
}
