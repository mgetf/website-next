import { notFound } from '$lib/server/utils/errors';
import type {
  EventListItem,
  EventDetail,
  EventPlacementEntry,
  EventStageDetail,
  EventParticipantEntry,
  EventUser,
} from '$lib/types/event';
import type { BracketData, BracketFormat, BracketStatus } from '$lib/types/bracket';
import {
  buildCardBracket,
  buildDoubleElimBracket,
  buildRoundRobinBracket,
  buildSingleElimBracket,
  type BracketStageInput,
} from '$lib/server/utils/bracketBuilders';
import type { EventStatus } from '$lib/types/event';

const USER_SELECT = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

async function mapRamaEventListItem(
  eventId: string,
  row: {
    name: string;
    type: string;
    status: string;
    isTeamEvent: boolean;
    description: string;
    avatar: string;
    startedAt: string;
    endedAt: string;
    prizepool: string;
    card: string;
    bracketLink: string;
  },
  placements: Array<Record<string, unknown>>,
  participants: Array<Record<string, unknown>>,
  snapshot: Record<string, unknown> | null,
): Promise<EventListItem> {
  const stages = Array.isArray(snapshot?.stages) ? (snapshot!.stages as unknown[]) : [];
  const topPlacements = placements
    .filter((p) => Number(p.placement ?? 99) <= 3)
    .sort((a, b) => Number(a.placement ?? 0) - Number(b.placement ?? 0))
    .map((p, i) => ({
      id: i + 1,
      placement: Number(p.placement ?? 0),
      steamId: (p.steamId as string) ?? null,
      displayName: String(p.displayName ?? p.steamId ?? ''),
      user: null,
    }));

  return {
    id: Number(eventId),
    name: row.name,
    type: row.type as EventListItem['type'],
    status: row.status as EventListItem['status'],
    isTeamEvent: Boolean(row.isTeamEvent),
    description: row.description || null,
    avatar: row.avatar || null,
    startedAt: row.startedAt || null,
    endedAt: row.endedAt || null,
    prizepool: Number(row.prizepool || 0),
    card: row.card || null,
    bracketLink: row.bracketLink || null,
    placements: topPlacements,
    matchCount: 0,
    participantCount: participants.length,
    stageCount: stages.length,
  };
}

export async function getAllEvents(): Promise<EventListItem[]> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const {
      createEventsClient,
      getEventIds,
      getEvent,
      getEventParticipants,
      getEventPlacements,
      getEventSnapshot,
    } = await import('$lib/server/rama/events');
    const client = createEventsClient(ramaClientOpts());
    const ids = await getEventIds(client);
    const rows: EventListItem[] = [];
    for (const id of ids) {
      const event = await getEvent(client, id);
      if (!event) continue;
      const [placements, participants, snapshot] = await Promise.all([
        getEventPlacements(client, id),
        getEventParticipants(client, id),
        getEventSnapshot(client, id),
      ]);
      rows.push(await mapRamaEventListItem(id, event, placements, participants, snapshot));
    }
    rows.sort((a, b) => {
      const at = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bt = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bt - at;
    });
    return rows;
  }
  throw new Error('getAllEvents requires DATA_BACKEND=rama');
}

export async function getEventById(id: number): Promise<EventDetail> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const {
      createEventsClient,
      getEvent,
      getEventParticipants,
      getEventPlacements,
      getEventSnapshot,
    } = await import('$lib/server/rama/events');
    const client = createEventsClient(ramaClientOpts());
    const event = await getEvent(client, String(id));
    if (!event) notFound('Event not found');
    const [placements, participants, snapshot] = await Promise.all([
      getEventPlacements(client, String(id)),
      getEventParticipants(client, String(id)),
      getEventSnapshot(client, String(id)),
    ]);
    const stages = Array.isArray(snapshot?.stages)
      ? (snapshot!.stages as Array<Record<string, unknown>>).map((s, i) => ({
          id: Number(s.id ?? i + 1),
          name: String(s.name ?? `Stage ${i + 1}`),
          bracketFormat: mapBracketFormat(String(s.bracketFormat ?? 'SINGLE_ELIM')),
          orderNum: Number(s.orderNum ?? i),
          matchCount: Array.isArray(s.matches) ? s.matches.length : Number(s.matchCount ?? 0),
        }))
      : [];

    return {
      id,
      name: event.name,
      type: event.type as EventDetail['type'],
      status: event.status as EventDetail['status'],
      isTeamEvent: Boolean(event.isTeamEvent),
      description: event.description || null,
      avatar: event.avatar || null,
      startedAt: event.startedAt || null,
      endedAt: event.endedAt || null,
      prizepool: Number(event.prizepool || 0),
      card: event.card || null,
      bracketLink: event.bracketLink || null,
      placements: placements.map((p, i) => ({
        id: i + 1,
        placement: Number(p.placement ?? 0),
        steamId: (p.steamId as string) ?? null,
        displayName: String(p.displayName ?? p.steamId ?? ''),
        user: null,
      })),
      participantCount: participants.length,
      stages,
      participants: participants.map((p, i) => ({
        id: i + 1,
        steamId: (p.steamId as string) ?? null,
        displayName: String(p.displayName ?? p.steamId ?? ''),
        seed: p.seed == null ? null : Number(p.seed),
        eliminated: Boolean(p.eliminated),
        user: null,
      })),
    };
  }
  throw new Error('getEventById requires DATA_BACKEND=rama');
}

export async function getEventBracketData(stageId: number): Promise<BracketData> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    notFound('Event stage not found');
  }
  throw new Error('getEventBracketData requires DATA_BACKEND=rama');
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

function mapPlacement(p: {
  id: number;
  placement: number;
  steamId: string | null;
  displayName: string;
  user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventPlacementEntry {
  return {
    id: p.id,
    placement: p.placement,
    steamId: p.steamId,
    displayName: p.displayName,
    user: p.user ? mapUser(p.user) : null,
  };
}

function mapUser(u: {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
}): EventUser {
  return { steamId: u.steamId, steamUsername: u.steamUsername, steamAvatar: u.steamAvatar };
}

function mapStage(s: {
  id: number;
  name: string;
  bracketFormat: string;
  orderNum: number;
  _count: { matches: number };
}): EventStageDetail {
  return {
    id: s.id,
    name: s.name,
    bracketFormat: mapBracketFormat(s.bracketFormat),
    orderNum: s.orderNum,
    matchCount: s._count.matches,
  };
}

function mapParticipant(p: {
  id: number;
  steamId: string | null;
  displayName: string;
  seed: number | null;
  eliminated: boolean;
  user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventParticipantEntry {
  return {
    id: p.id,
    steamId: p.steamId,
    displayName: p.displayName,
    seed: p.seed,
    eliminated: p.eliminated,
    user: p.user ? mapUser(p.user) : null,
  };
}

export function mapBracketFormat(dbFormat: string): BracketFormat {
  const map: Record<string, BracketFormat> = {
    SINGLE_ELIM: 'single_elim',
    DOUBLE_ELIM: 'double_elim',
    ROUND_ROBIN: 'round_robin',
    CARD: 'card',
  };
  return map[dbFormat] ?? 'single_elim';
}

export function mapEventStatusToBracketStatus(status: EventStatus): BracketStatus {
  if (status === 'IN_PROGRESS' || status === 'REGISTRATION') return 'in_progress';
  if (status === 'COMPLETED') return 'completed';
  return 'upcoming';
}
