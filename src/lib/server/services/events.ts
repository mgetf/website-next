import { prisma } from '$lib/server/db';
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
import type {
  EventType as PrismaEventType,
  EventStatus as PrismaEventStatus,
} from '$prisma/client.js';

const USER_SELECT = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

export async function getAllEvents(): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    orderBy: { startedAt: 'desc' },
    include: {
      placements: {
        where: { placement: { lte: 3 } },
        orderBy: { placement: 'asc' },
        include: { user: { select: USER_SELECT } },
      },
      participants: {
        include: { user: { select: USER_SELECT } },
      },
      stages: {
        include: {
          _count: { select: { matches: true } },
        },
      },
    },
  });

  return events.map((e) => {
    const matchCount = e.stages.reduce((sum, s) => sum + s._count.matches, 0);
    return {
      id: e.id,
      name: e.name,
      type: e.type as EventListItem['type'],
      status: e.status as EventListItem['status'],
      isTeamEvent: e.isTeamEvent,
      description: e.description,
      avatar: e.avatar,
      startedAt: e.startedAt?.toISOString() ?? null,
      endedAt: e.endedAt?.toISOString() ?? null,
      prizepool: Number(e.prizepool),
      card: e.card,
      bracketLink: e.bracketLink,
      placements: e.placements.map(mapPlacement),
      matchCount,
      participantCount: e.participants.length,
      stageCount: e.stages.length,
    };
  });
}

export async function getEventById(id: number): Promise<EventDetail> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      placements: {
        orderBy: { placement: 'asc' },
        include: { user: { select: USER_SELECT } },
      },
      participants: {
        orderBy: { seed: 'asc' },
        include: { user: { select: USER_SELECT } },
      },
      stages: {
        orderBy: { orderNum: 'asc' },
        include: {
          _count: { select: { matches: true } },
        },
      },
    },
  });

  if (!event) notFound('Event not found');

  return {
    id: event.id,
    name: event.name,
    type: event.type as EventDetail['type'],
    status: event.status as EventDetail['status'],
    isTeamEvent: event.isTeamEvent,
    description: event.description,
    avatar: event.avatar,
    startedAt: event.startedAt?.toISOString() ?? null,
    endedAt: event.endedAt?.toISOString() ?? null,
    prizepool: Number(event.prizepool),
    card: event.card,
    bracketLink: event.bracketLink,
    placements: event.placements.map(mapPlacement),
    participantCount: event.participants.length,
    stages: event.stages.map(mapStage),
    participants: event.participants.map(mapParticipant),
  };
}

export async function getEventBracketData(stageId: number): Promise<BracketData> {
  const stage = await prisma.eventStage.findUnique({
    where: { id: stageId },
    include: {
      event: { select: { status: true, name: true } },
      matches: {
        orderBy: [{ round: 'asc' }, { orderNum: 'asc' }],
        include: {
          players: { orderBy: { side: 'asc' } },
          games: {
            orderBy: { gameNumber: 'asc' },
            include: { arena: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!stage) notFound('Event stage not found');

  const format = mapBracketFormat(stage.bracketFormat);
  const status = mapEventStatusToBracketStatus(stage.event.status as PrismaEventStatus);
  const stageInput = stage as unknown as BracketStageInput;

  if (format === 'card') return buildCardBracket(stageInput, status);
  if (format === 'round_robin') return buildRoundRobinBracket(stageInput, status);
  if (format === 'double_elim') return buildDoubleElimBracket(stageInput, status);
  return buildSingleElimBracket(stageInput, status);
}

export async function createEvent(data: {
  name: string;
  type: PrismaEventType;
  description?: string;
  avatar?: string;
  startedAt?: Date;
  isTeamEvent?: boolean;
  bracketLink?: string;
  prizepool?: number;
  card?: string;
}) {
  return await prisma.event.create({
    data: {
      name: data.name,
      type: data.type,
      description: data.description ?? null,
      avatar: data.avatar ?? null,
      startedAt: data.startedAt ?? null,
      isTeamEvent: data.isTeamEvent ?? false,
      bracketLink: data.bracketLink ?? null,
      prizepool: data.prizepool ?? 0,
      card: data.card ?? null,
      status: 'UPCOMING',
    },
  });
}

export async function getRecentEvents(limit: number = 3): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    take: limit,
    orderBy: { startedAt: 'desc' },
    include: {
      placements: {
        where: { placement: { lte: 3 } },
        orderBy: { placement: 'asc' },
        include: { user: { select: USER_SELECT } },
      },
      participants: {
        select: { steamId: true },
      },
      stages: {
        include: {
          _count: { select: { matches: true } },
        },
      },
    },
  });

  return events.map((e) => {
    const matchCount = e.stages.reduce((sum, s) => sum + s._count.matches, 0);
    return {
      id: e.id,
      name: e.name,
      type: e.type as EventListItem['type'],
      status: e.status as EventListItem['status'],
      isTeamEvent: e.isTeamEvent,
      description: e.description,
      avatar: e.avatar,
      startedAt: e.startedAt?.toISOString() ?? null,
      endedAt: e.endedAt?.toISOString() ?? null,
      prizepool: Number(e.prizepool),
      card: e.card,
      bracketLink: e.bracketLink,
      placements: e.placements.map(mapPlacement),
      matchCount,
      participantCount: e.participants.length,
      stageCount: e.stages.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

function mapPlacement(p: {
  placement: number;
  steamId: string;
  user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventPlacementEntry {
  return {
    placement: p.placement,
    steamId: p.steamId,
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
  steamId: string;
  seed: number | null;
  eliminated: boolean;
  user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventParticipantEntry {
  return {
    steamId: p.steamId,
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

export function mapEventStatusToBracketStatus(status: PrismaEventStatus): BracketStatus {
  if (status === 'IN_PROGRESS' || status === 'REGISTRATION') return 'in_progress';
  if (status === 'COMPLETED') return 'completed';
  return 'upcoming';
}
