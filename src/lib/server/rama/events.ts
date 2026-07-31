/**
 * Typed helpers for EventsModule over Rama REST JSON.
 *
 * @lintignore Spike event helpers; production tournaments still use Postgres.
 */

import { RamaClient, type AckLevel } from './client';

export const EVENTS_MODULE = 'mge.tf.rama.events-module/EventsModule';
export const EVENT_DEPOT = '*event-depot';

export type EventAck = {
  ok: boolean;
  error?: string;
  eventId?: string;
  status?: string;
  type?: string;
};

export type EventRecord = {
  name: string;
  type: string;
  status: string;
  isTeamEvent: boolean;
  description: string;
  avatar: string;
  startedAt: string;
  endedAt: string;
  prizepool: string;
  bracketLink: string;
  card: string;
};

function asAck(topologyReturns: Record<string, unknown>): EventAck {
  const raw = topologyReturns['events'];
  if (raw && typeof raw === 'object') return raw as EventAck;
  return { ok: false, error: 'missing-ack' };
}

export function createEventsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: EVENTS_MODULE,
  });
}

export async function createEvent(
  client: RamaClient,
  event: {
    eventId: string;
    name: string;
    eventType: 'CUP' | 'CHAMPIONSHIP' | 'FIGHT_NIGHT';
    isTeamEvent?: boolean;
    description?: string;
    avatar?: string;
    prizepool?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(
    await client.append(
      EVENT_DEPOT,
      {
        type: 'create-event',
        eventId: event.eventId,
        name: event.name,
        eventType: event.eventType,
        isTeamEvent: event.isTeamEvent ?? false,
        description: event.description ?? '',
        avatar: event.avatar ?? '',
        prizepool: event.prizepool ?? '0',
      },
      ackLevel,
    ),
  );
}

export async function updateEvent(
  client: RamaClient,
  event: {
    eventId: string;
    name: string;
    description?: string;
    avatar?: string;
    startedAt?: string;
    endedAt?: string;
    prizepool?: string;
    bracketLink?: string;
    card?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(
    await client.append(
      EVENT_DEPOT,
      {
        type: 'update-event',
        eventId: event.eventId,
        name: event.name,
        description: event.description ?? '',
        avatar: event.avatar ?? '',
        startedAt: event.startedAt ?? '',
        endedAt: event.endedAt ?? '',
        prizepool: event.prizepool ?? '0',
        bracketLink: event.bracketLink ?? '',
        card: event.card ?? '',
      },
      ackLevel,
    ),
  );
}

export async function setEventStatus(
  client: RamaClient,
  event: {
    eventId: string;
    status: 'UPCOMING' | 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED';
  },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(await client.append(EVENT_DEPOT, { type: 'set-status', ...event }, ackLevel));
}

export async function setEventParticipants(
  client: RamaClient,
  event: {
    eventId: string;
    participants: Array<Record<string, unknown>>;
  },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(await client.append(EVENT_DEPOT, { type: 'set-participants', ...event }, ackLevel));
}

export async function setEventPlacements(
  client: RamaClient,
  event: {
    eventId: string;
    placements: Array<Record<string, unknown>>;
  },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(await client.append(EVENT_DEPOT, { type: 'set-placements', ...event }, ackLevel));
}

export async function setEventSnapshot(
  client: RamaClient,
  event: { eventId: string; snapshot: Record<string, unknown> },
  ackLevel: AckLevel = 'ack',
): Promise<EventAck> {
  return asAck(await client.append(EVENT_DEPOT, { type: 'set-snapshot', ...event }, ackLevel));
}

export async function getEvent(client: RamaClient, eventId: string): Promise<EventRecord | null> {
  try {
    const v = await client.selectOne('$$events', [eventId]);
    if (!v || typeof v !== 'object') return null;
    return v as EventRecord;
  } catch {
    return null;
  }
}

export async function getEventStatus(client: RamaClient, eventId: string): Promise<string | null> {
  try {
    return (await client.selectOne('$$events', [eventId, 'status'])) as string;
  } catch {
    return null;
  }
}

export async function getEventParticipants(
  client: RamaClient,
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const v = await client.selectOne('$$event-participants', [eventId]);
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

export async function getEventPlacements(
  client: RamaClient,
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const v = await client.selectOne('$$event-placements', [eventId]);
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

export async function getEventSnapshot(
  client: RamaClient,
  eventId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const v = await client.selectOne('$$event-snapshot', [eventId]);
    if (!v || typeof v !== 'object') return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getEventIds(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$event-ids', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}
