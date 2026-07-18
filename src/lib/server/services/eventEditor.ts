import { prisma } from '$lib/server/db';
import { badRequest, conflict, notFound } from '$lib/server/utils/errors';
import { validateEventDraftPayload, eventDraftPayloadSchema } from '$lib/server/utils/validation';
import { hasBlockingErrors, isStaleDraftRevision } from '$lib/utils/tournamentDraftValidation';
import {
  inferBracketTopology,
  isStructurallyFlat,
  type TopologyResult,
} from '$lib/server/utils/bracketTopology';
import {
  buildCardBracket,
  buildDoubleElimBracket,
  buildRoundRobinBracket,
  buildSingleElimBracket,
  type BracketStageInput,
} from '$lib/server/utils/bracketBuilders';
import { mapEventStatusToBracketStatus } from '$lib/server/services/events';
import { AuditAction, AuditCategory, logAudit } from '$lib/server/services/auditLog';
import {
  createEmptyDraftPayload,
  normalizeLegacyEventDraftPayload,
  type DraftEliminationMatch,
  type DraftStage,
  type EventDraftDetail,
  type EventDraftPayload,
  type EventDraftPreview,
  type EventRevisionSummary,
  type TournamentEditorListItem,
  type ValidationIssue,
} from '$lib/types/tournament-editor';
import type { Prisma } from '$prisma/client.js';
import { steamId64FromAnyFormat } from '$lib/utils/steamid';

export interface EventEditorActor {
  steamId: string;
  role: string;
  ipAddress?: string | null;
}

const EVENT_GRAPH_INCLUDE = {
  participants: {
    orderBy: { seed: 'asc' as const },
    include: {
      user: {
        select: {
          steamUsername: true,
        },
      },
    },
  },
  placements: {
    orderBy: { placement: 'asc' as const },
  },
  stages: {
    orderBy: { orderNum: 'asc' as const },
    include: {
      matches: {
        orderBy: [{ round: 'asc' as const }, { orderNum: 'asc' as const }],
        include: {
          players: { orderBy: { side: 'asc' as const } },
          games: { orderBy: { gameNumber: 'asc' as const } },
        },
      },
    },
  },
} satisfies Prisma.EventInclude;

type PublishedEventGraph = Prisma.EventGetPayload<{ include: typeof EVENT_GRAPH_INCLUDE }>;

function inputJson(payload: EventDraftPayload): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}

function parseStoredPayload(payload: Prisma.JsonValue): EventDraftPayload {
  const result = eventDraftPayloadSchema.safeParse(normalizeLegacyEventDraftPayload(payload));
  if (!result.success) {
    badRequest('Stored tournament draft has an invalid payload');
  }
  return result.data as EventDraftPayload;
}

function eventDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) badRequest(`Invalid event date: ${value}`);
  return parsed;
}

function matchSide(value: number | null): 1 | 2 | null {
  return value === 1 || value === 2 ? value : null;
}

function topologyForStage(
  stage: PublishedEventGraph['stages'][number],
): Map<number, TopologyResult> {
  if (stage.bracketFormat !== 'SINGLE_ELIM' && stage.bracketFormat !== 'DOUBLE_ELIM') {
    return new Map();
  }

  const inferred = inferBracketTopology(stage.matches, stage.bracketFormat);
  return new Map(inferred.map((result) => [result.id, result]));
}

function clonePublishedPayload(
  event: PublishedEventGraph,
  applyKnownCorrections = true,
): EventDraftPayload {
  const participants: EventDraftPayload['participants'] = event.participants.map((participant) => ({
    id: String(participant.id),
    steamId: participant.steamId,
    displayName: participant.displayName,
    seed: participant.seed,
    eliminated: participant.eliminated,
    hidden: participant.hidden,
  }));
  const participantIds = new Set(participants.map((participant) => participant.id));

  function ensureParticipant(
    steamId: string | null,
    displayName: string,
    preferredId: string,
    allowBye = false,
  ): string | null {
    if (!allowBye && !steamId && displayName.trim().toLocaleLowerCase() === 'bye') return null;
    const participant = participants.find((candidate) =>
      steamId
        ? candidate.steamId === steamId
        : candidate.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase(),
    );
    if (participant) return participant.id;

    let id = preferredId;
    let suffix = 1;
    while (participantIds.has(id)) {
      id = `${preferredId}-${suffix}`;
      suffix += 1;
    }
    participantIds.add(id);
    participants.push({
      id,
      steamId,
      displayName,
      seed: null,
      eliminated: false,
      hidden: false,
    });
    return id;
  }

  const publishedStages =
    applyKnownCorrections && event.name === '2v2 OPEN Dolphinrider Cup'
      ? event.stages.filter((stage) => stage.matches.length > 0)
      : event.stages;
  const stages: DraftStage[] = publishedStages.map((stage, stageIndex) => {
    const shouldConvertToCard =
      applyKnownCorrections &&
      (stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM') &&
      isStructurallyFlat(stage.matches);
    const bracketFormat = shouldConvertToCard ? 'CARD' : stage.bracketFormat;
    const topology = topologyForStage(stage);

    const base = {
      id: String(stage.id),
      name: stage.name,
      orderNum: applyKnownCorrections ? stageIndex + 1 : stage.orderNum,
    };

    const simpleMatches = stage.matches.map((match) => ({
      id: String(match.id),
      orderNum: match.orderNum,
      round: shouldConvertToCard ? 1 : match.round,
      label: match.label,
      boSeries: match.boSeries,
      status: match.status,
      winnerSide: matchSide(match.winnerSide),
      side1Score: match.side1Score,
      side2Score: match.side2Score,
      players: match.players.map((player) => ({
        side: player.side === 2 ? (2 as const) : (1 as const),
        participantId: ensureParticipant(
          player.steamId,
          player.displayName,
          `match-player-${player.id}`,
        ),
        steamId: player.steamId,
        displayName: player.displayName,
      })),
      games: match.games.map((game) => ({
        id: String(game.id),
        gameNumber: game.gameNumber,
        side1Score: game.side1Score,
        side2Score: game.side2Score,
        arenaId: game.arenaId,
        playedAt: game.playedAt?.toISOString() ?? null,
      })),
    }));

    if (bracketFormat === 'SINGLE_ELIM' || bracketFormat === 'DOUBLE_ELIM') {
      return {
        ...base,
        bracketFormat,
        matches: simpleMatches.map((match) => {
          const source = stage.matches.find((candidate) => String(candidate.id) === match.id)!;
          const inferred = topology.get(source.id);
          return {
            ...match,
            section:
              source.section ??
              inferred?.section ??
              (bracketFormat === 'SINGLE_ELIM' ? 'MAIN' : 'WINNERS'),
            winnerNextMatchId:
              source.winnerNextMatchId !== null
                ? String(source.winnerNextMatchId)
                : inferred?.winnerNextMatchId !== null && inferred?.winnerNextMatchId !== undefined
                  ? String(inferred.winnerNextMatchId)
                  : null,
            winnerNextSide: matchSide(source.winnerNextSide) ?? inferred?.winnerNextSide ?? null,
            loserNextMatchId:
              source.loserNextMatchId !== null
                ? String(source.loserNextMatchId)
                : inferred?.loserNextMatchId !== null && inferred?.loserNextMatchId !== undefined
                  ? String(inferred.loserNextMatchId)
                  : null,
            loserNextSide: matchSide(source.loserNextSide) ?? inferred?.loserNextSide ?? null,
          };
        }),
      };
    }

    return {
      ...base,
      bracketFormat,
      matches: simpleMatches,
    } as DraftStage;
  });

  return {
    name: event.name,
    type: event.type,
    status: event.status,
    isTeamEvent: event.isTeamEvent,
    description: event.description,
    avatar: event.avatar,
    startedAt: event.startedAt?.toISOString() ?? null,
    endedAt: event.endedAt?.toISOString() ?? null,
    prizepool: Number(event.prizepool),
    card: event.card,
    bracketLink: event.bracketLink,
    stages,
    participants,
    placements: event.placements.map((placement) => ({
      id: String(placement.id),
      participantId: ensureParticipant(
        placement.steamId,
        placement.displayName,
        `placement-participant-${placement.id}`,
        true,
      )!,
      placement: placement.placement,
    })),
  };
}

async function audit(
  actor: EventEditorActor,
  action: (typeof AuditAction)[keyof typeof AuditAction],
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAudit({
    actorId: actor.steamId,
    actorRole: actor.role,
    category: AuditCategory.TOURNAMENT,
    action,
    targetType: 'Event',
    targetId,
    metadata,
    ipAddress: actor.ipAddress ?? null,
  });
}

export async function listTournamentEditorItems(): Promise<TournamentEditorListItem[]> {
  const [events, orphanDrafts] = await Promise.all([
    prisma.event.findMany({
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: {
        draft: true,
        stages: { include: { _count: { select: { matches: true } } } },
      },
    }),
    prisma.eventDraft.findMany({
      where: { eventId: null },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const published = events.map((event) => {
    const payload = event.draft ? parseStoredPayload(event.draft.payload) : null;
    const validationIssues = payload ? validateEventDraftPayload(payload).issues.length : 0;
    return {
      eventId: event.id,
      draftId: event.draft?.id ?? null,
      name: payload?.name ?? event.name,
      type: payload?.type ?? event.type,
      status: payload?.status ?? event.status,
      startedAt: event.startedAt?.toISOString() ?? null,
      draftRevision: event.draft?.revision ?? null,
      draftUpdatedAt: event.draft?.updatedAt.toISOString() ?? null,
      validationIssues,
      stageCount: event.stages.length,
      matchCount: event.stages.reduce((sum, stage) => sum + stage._count.matches, 0),
    } satisfies TournamentEditorListItem;
  });

  const unpublished = orphanDrafts.map((draft) => {
    const payload = parseStoredPayload(draft.payload);
    return {
      eventId: null,
      draftId: draft.id,
      name: payload.name,
      type: payload.type,
      status: payload.status,
      startedAt: payload.startedAt,
      draftRevision: draft.revision,
      draftUpdatedAt: draft.updatedAt.toISOString(),
      validationIssues: validateEventDraftPayload(payload).issues.length,
      stageCount: payload.stages.length,
      matchCount: payload.stages.reduce((sum, stage) => sum + stage.matches.length, 0),
    } satisfies TournamentEditorListItem;
  });

  return [...unpublished, ...published];
}

export async function searchTournamentEditorUsers(
  query: string,
  limit = 25,
): Promise<Array<{ steamId: string; name: string; avatar: string | null }>> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const normalizedSteamId = steamId64FromAnyFormat(trimmed);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { steamUsername: { contains: trimmed, mode: 'insensitive' } },
        { steamId: { contains: trimmed } },
        ...(normalizedSteamId ? [{ steamId: normalizedSteamId }] : []),
      ],
    },
    select: { steamId: true, steamUsername: true, steamAvatar: true },
    orderBy: [{ steamUsername: 'asc' }, { steamId: 'asc' }],
    take: Math.min(Math.max(limit, 1), 50),
  });
  return users.map((user) => ({
    steamId: user.steamId,
    name: user.steamUsername,
    avatar: user.steamAvatar,
  }));
}

export async function getEventDraft(draftId: number): Promise<EventDraftDetail> {
  const draft = await prisma.eventDraft.findUnique({ where: { id: draftId } });
  if (!draft) notFound('Tournament draft not found');

  return {
    draftId: draft.id,
    eventId: draft.eventId,
    revision: draft.revision,
    updatedAt: draft.updatedAt.toISOString(),
    payload: parseStoredPayload(draft.payload),
  };
}

export async function getEventDraftRevisions(draftId: number): Promise<EventRevisionSummary[]> {
  const draft = await prisma.eventDraft.findUnique({
    where: { id: draftId },
    select: { eventId: true },
  });
  if (!draft) notFound('Tournament draft not found');
  if (!draft.eventId) return [];

  const revisions = await prisma.eventRevision.findMany({
    where: { eventId: draft.eventId },
    orderBy: { revision: 'desc' },
    include: {
      publisher: { select: { steamUsername: true } },
    },
  });

  return revisions.map((revision) => ({
    id: revision.id,
    revision: revision.revision,
    publishedAt: revision.publishedAt.toISOString(),
    publishedByName: revision.publisher?.steamUsername ?? null,
    summary: revision.summary,
  }));
}

export async function createEventDraft(
  input: { name: string; type: EventDraftPayload['type'] },
  actor: EventEditorActor,
): Promise<EventDraftDetail> {
  const payload = { ...createEmptyDraftPayload(), name: input.name, type: input.type };
  const draft = await prisma.eventDraft.create({
    data: {
      payload: inputJson(payload),
      createdBy: actor.steamId,
      updatedBy: actor.steamId,
    },
  });

  await audit(actor, AuditAction.TOURNAMENT_DRAFT_CREATED, `draft:${draft.id}`, {
    draftId: draft.id,
    name: input.name,
    type: input.type,
  });

  return {
    draftId: draft.id,
    eventId: null,
    revision: draft.revision,
    updatedAt: draft.updatedAt.toISOString(),
    payload,
  };
}

export async function cloneEventToDraft(
  eventId: number,
  actor: EventEditorActor,
): Promise<EventDraftDetail> {
  const existing = await prisma.eventDraft.findUnique({ where: { eventId } });
  if (existing) return getEventDraft(existing.id);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: EVENT_GRAPH_INCLUDE,
  });
  if (!event) notFound('Event not found');

  const payload = clonePublishedPayload(event);
  const publishedPayload = clonePublishedPayload(event, false);
  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.eventDraft.create({
      data: {
        eventId,
        payload: inputJson(payload),
        createdBy: actor.steamId,
        updatedBy: actor.steamId,
      },
    });
    await tx.eventRevision.upsert({
      where: { eventId_revision: { eventId, revision: 1 } },
      create: {
        eventId,
        revision: 1,
        payload: inputJson(publishedPayload),
        summary: 'Imported published state',
        publishedBy: actor.steamId,
      },
      update: {},
    });
    return created;
  });

  await audit(actor, AuditAction.TOURNAMENT_DRAFT_CREATED, String(eventId), {
    draftId: draft.id,
    clonedFromPublishedEvent: true,
  });

  return {
    draftId: draft.id,
    eventId,
    revision: draft.revision,
    updatedAt: draft.updatedAt.toISOString(),
    payload,
  };
}

export async function saveEventDraft(input: {
  draftId: number;
  expectedRevision: number;
  payload: EventDraftPayload;
  actor: EventEditorActor;
}): Promise<EventDraftDetail> {
  const parsed = eventDraftPayloadSchema.parse(input.payload) as EventDraftPayload;
  const result = await prisma.eventDraft.updateMany({
    where: { id: input.draftId, revision: input.expectedRevision },
    data: {
      payload: inputJson(parsed),
      revision: { increment: 1 },
      updatedBy: input.actor.steamId,
    },
  });
  if (result.count !== 1) {
    conflict('This draft was changed by another administrator. Reload before saving again.');
  }

  const saved = await getEventDraft(input.draftId);
  await audit(
    input.actor,
    AuditAction.TOURNAMENT_DRAFT_SAVED,
    saved.eventId ? String(saved.eventId) : `draft:${saved.draftId}`,
    {
      draftId: saved.draftId,
      previousRevision: input.expectedRevision,
      revision: saved.revision,
      issueCount: validateEventDraftPayload(parsed).issues.length,
    },
  );
  return saved;
}

async function validateDatabaseReferences(payload: EventDraftPayload): Promise<ValidationIssue[]> {
  const steamIds = [
    ...new Set([
      ...payload.participants.flatMap((participant) =>
        participant.steamId ? [participant.steamId] : [],
      ),
      ...payload.stages.flatMap((stage) =>
        stage.matches.flatMap((match) =>
          match.players.flatMap((player) => (player.steamId ? [player.steamId] : [])),
        ),
      ),
    ]),
  ];
  const arenaIds = [
    ...new Set(
      payload.stages.flatMap((stage) =>
        stage.matches.flatMap((match) =>
          match.games.flatMap((game) => (game.arenaId ? [game.arenaId] : [])),
        ),
      ),
    ),
  ];

  const [users, arenas] = await Promise.all([
    prisma.user.findMany({
      where: { steamId: { in: steamIds } },
      select: { steamId: true },
    }),
    prisma.arena.findMany({
      where: { id: { in: arenaIds } },
      select: { id: true },
    }),
  ]);

  const userIds = new Set(users.map((user) => user.steamId));
  const validArenaIds = new Set(arenas.map((arena) => arena.id));
  const issues: ValidationIssue[] = [];

  for (const steamId of steamIds) {
    if (!userIds.has(steamId)) {
      issues.push({
        path: 'participants',
        message: `Steam ID ${steamId} does not reference a registered user.`,
        severity: 'error',
      });
    }
  }
  for (const arenaId of arenaIds) {
    if (!validArenaIds.has(arenaId)) {
      issues.push({
        path: 'stages',
        message: `Arena ID ${arenaId} does not exist.`,
        severity: 'error',
      });
    }
  }

  return issues;
}

export async function validateEventDraftForPublish(
  payload: unknown,
): Promise<{ payload: EventDraftPayload | null; issues: ValidationIssue[] }> {
  const validation = validateEventDraftPayload(payload);
  if (!validation.payload) return validation;
  const databaseIssues = await validateDatabaseReferences(validation.payload);
  return {
    payload: validation.payload,
    issues: [...validation.issues, ...databaseIssues],
  };
}

function previewStage(stage: DraftStage, status: EventDraftPayload['status']) {
  const input = stage as unknown as BracketStageInput;
  const bracketStatus = mapEventStatusToBracketStatus(status);
  if (stage.bracketFormat === 'CARD') return buildCardBracket(input, bracketStatus);
  if (stage.bracketFormat === 'ROUND_ROBIN') return buildRoundRobinBracket(input, bracketStatus);
  if (stage.bracketFormat === 'DOUBLE_ELIM') return buildDoubleElimBracket(input, bracketStatus);
  return buildSingleElimBracket(input, bracketStatus);
}

export async function previewEventDraft(payload: unknown): Promise<EventDraftPreview> {
  const validation = validateEventDraftPayload(payload);
  if (!validation.payload) return { issues: validation.issues, brackets: [] };

  return {
    issues: validation.issues,
    brackets: validation.payload.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      data: previewStage(stage, validation.payload!.status),
    })),
  };
}

async function clearEventGraph(tx: Prisma.TransactionClient, eventId: number): Promise<void> {
  await tx.eventMatch.updateMany({
    where: { stage: { eventId } },
    data: {
      winnerNextMatchId: null,
      winnerNextSide: null,
      loserNextMatchId: null,
      loserNextSide: null,
    },
  });
  await tx.eventGame.deleteMany({ where: { match: { stage: { eventId } } } });
  await tx.eventMatchPlayer.deleteMany({ where: { match: { stage: { eventId } } } });
  await tx.eventMatch.deleteMany({ where: { stage: { eventId } } });
  await tx.eventStage.deleteMany({ where: { eventId } });
  await tx.eventPlacement.deleteMany({ where: { eventId } });
  await tx.eventParticipant.deleteMany({ where: { eventId } });
}

async function writeEventGraph(
  tx: Prisma.TransactionClient,
  eventId: number,
  payload: EventDraftPayload,
): Promise<void> {
  if (payload.participants.length > 0) {
    await tx.eventParticipant.createMany({
      data: payload.participants.map((participant) => ({
        eventId,
        steamId: participant.steamId,
        displayName: participant.displayName,
        seed: participant.seed,
        eliminated: participant.eliminated,
        hidden: participant.hidden,
      })),
    });
  }

  if (payload.placements.length > 0) {
    await tx.eventPlacement.createMany({
      data: payload.placements.map((placement) => {
        const participant = payload.participants.find(
          (candidate) => candidate.id === placement.participantId,
        );
        if (!participant) {
          badRequest('Placement references a missing participant');
        }
        return {
          eventId,
          steamId: participant.steamId,
          displayName: participant.displayName,
          placement: placement.placement,
        };
      }),
    });
  }

  for (const stage of [...payload.stages].sort((a, b) => a.orderNum - b.orderNum)) {
    const createdStage = await tx.eventStage.create({
      data: {
        eventId,
        name: stage.name,
        bracketFormat: stage.bracketFormat,
        orderNum: stage.orderNum,
      },
    });

    const matchIds = new Map<string, number>();
    for (const match of [...stage.matches].sort((a, b) => a.orderNum - b.orderNum)) {
      const createdMatch = await tx.eventMatch.create({
        data: {
          stageId: createdStage.id,
          round: match.round,
          orderNum: match.orderNum,
          label: match.label,
          winnerSide: match.winnerSide,
          side1Score: match.side1Score,
          side2Score: match.side2Score,
          boSeries: match.boSeries,
          status: match.status,
          section:
            stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM'
              ? (match as DraftEliminationMatch).section
              : null,
          players: {
            create: match.players.map((player) => ({
              steamId: player.steamId,
              displayName: player.displayName,
              side: player.side,
            })),
          },
          games: {
            create: match.games.map((game) => ({
              gameNumber: game.gameNumber,
              side1Score: game.side1Score,
              side2Score: game.side2Score,
              arenaId: game.arenaId,
              playedAt: eventDate(game.playedAt),
            })),
          },
        },
      });
      matchIds.set(match.id, createdMatch.id);
    }

    if (stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM') {
      for (const match of stage.matches as DraftEliminationMatch[]) {
        const persistedId = matchIds.get(match.id);
        if (!persistedId) continue;
        await tx.eventMatch.update({
          where: { id: persistedId },
          data: {
            winnerNextMatchId: match.winnerNextMatchId
              ? matchIds.get(match.winnerNextMatchId)
              : null,
            winnerNextSide: match.winnerNextSide,
            loserNextMatchId: match.loserNextMatchId ? matchIds.get(match.loserNextMatchId) : null,
            loserNextSide: match.loserNextSide,
          },
        });
      }
    }
  }
}

export async function publishEventDraft(input: {
  draftId: number;
  expectedRevision: number;
  payload: EventDraftPayload;
  summary?: string;
  actor: EventEditorActor;
}): Promise<{ eventId: number; publishedRevision: number; draftRevision: number }> {
  const validation = await validateEventDraftForPublish(input.payload);
  if (!validation.payload || hasBlockingErrors(validation.issues)) {
    badRequest(
      validation.issues.find((issue) => issue.severity === 'error')?.message ??
        'Draft validation failed',
    );
  }
  const payload = validation.payload;

  const result = await prisma.$transaction(async (tx) => {
    const draft = await tx.eventDraft.findUnique({ where: { id: input.draftId } });
    if (!draft) notFound('Tournament draft not found');
    if (isStaleDraftRevision(draft.revision, input.expectedRevision)) {
      conflict('This draft was changed by another administrator. Reload before publishing.');
    }

    const eventData = {
      name: payload.name,
      type: payload.type,
      status: payload.status,
      isTeamEvent: payload.isTeamEvent,
      description: payload.description,
      avatar: payload.avatar,
      startedAt: eventDate(payload.startedAt),
      endedAt: eventDate(payload.endedAt),
      prizepool: payload.prizepool,
      card: payload.card,
      bracketLink: payload.bracketLink,
    };

    const event = draft.eventId
      ? await tx.event.update({ where: { id: draft.eventId }, data: eventData })
      : await tx.event.create({ data: eventData });

    await clearEventGraph(tx, event.id);
    await writeEventGraph(tx, event.id, payload);

    const latestRevision = await tx.eventRevision.aggregate({
      where: { eventId: event.id },
      _max: { revision: true },
    });
    const publishedRevision = (latestRevision._max.revision ?? 0) + 1;

    await tx.eventRevision.create({
      data: {
        eventId: event.id,
        revision: publishedRevision,
        payload: inputJson(payload),
        summary: input.summary?.trim() || null,
        publishedBy: input.actor.steamId,
      },
    });

    const updatedDraft = await tx.eventDraft.update({
      where: { id: draft.id },
      data: {
        eventId: event.id,
        payload: inputJson(payload),
        revision: { increment: 1 },
        updatedBy: input.actor.steamId,
      },
    });

    return {
      eventId: event.id,
      publishedRevision,
      draftRevision: updatedDraft.revision,
    };
  });

  await audit(input.actor, AuditAction.TOURNAMENT_PUBLISHED, String(result.eventId), {
    draftId: input.draftId,
    publishedRevision: result.publishedRevision,
    draftRevision: result.draftRevision,
    summary: input.summary?.trim() || null,
  });
  return result;
}

export async function restoreEventRevision(input: {
  draftId: number;
  revisionId: number;
  expectedRevision: number;
  actor: EventEditorActor;
}): Promise<{ eventId: number; publishedRevision: number; draftRevision: number }> {
  const revision = await prisma.eventRevision.findUnique({ where: { id: input.revisionId } });
  if (!revision) notFound('Published revision not found');

  const draft = await prisma.eventDraft.findUnique({ where: { id: input.draftId } });
  if (!draft) notFound('Tournament draft not found');
  if (draft.eventId !== revision.eventId) {
    badRequest('Published revision does not belong to this tournament');
  }

  const payload = parseStoredPayload(revision.payload);
  const result = await publishEventDraft({
    draftId: input.draftId,
    expectedRevision: input.expectedRevision,
    payload,
    summary: `Restored published revision ${revision.revision}`,
    actor: input.actor,
  });

  await audit(input.actor, AuditAction.TOURNAMENT_REVISION_RESTORED, String(result.eventId), {
    draftId: input.draftId,
    restoredRevisionId: revision.id,
    restoredRevision: revision.revision,
    publishedRevision: result.publishedRevision,
  });
  return result;
}

export async function importHistoricalEventDrafts(
  actor: EventEditorActor,
): Promise<{ imported: number; existing: number }> {
  const events = await prisma.event.findMany({
    where: { draft: null },
    include: EVENT_GRAPH_INCLUDE,
  });

  let imported = 0;
  for (const event of events) {
    const payload = clonePublishedPayload(event);
    const publishedPayload = clonePublishedPayload(event, false);
    await prisma.$transaction(async (tx) => {
      await tx.eventDraft.create({
        data: {
          eventId: event.id,
          payload: inputJson(payload),
          createdBy: actor.steamId,
          updatedBy: actor.steamId,
        },
      });
      await tx.eventRevision.upsert({
        where: { eventId_revision: { eventId: event.id, revision: 1 } },
        create: {
          eventId: event.id,
          revision: 1,
          payload: inputJson(publishedPayload),
          summary: 'Imported published state',
          publishedBy: actor.steamId,
        },
        update: {},
      });
    });
    imported += 1;
  }

  if (imported > 0) {
    await audit(actor, AuditAction.TOURNAMENT_DRAFT_CREATED, 'historical-import', {
      imported,
    });
  }

  return {
    imported,
    existing: await prisma.eventDraft.count({ where: { eventId: { not: null } } }),
  };
}
