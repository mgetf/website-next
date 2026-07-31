// @ts-nocheck — Prisma graph editor stubbed during Rama cutover
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
} satisfies Record<string, unknown>;

type PublishedEventGraph = any;

function inputJson(payload: EventDraftPayload): unknown {
  return payload as unknown as unknown;
}

function parseStoredPayload(payload: unknown): EventDraftPayload {
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
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // Draft/revision editor stays Postgres until EventsModule grows draft support.
    return [];
  }
  throw new Error('listTournamentEditorItems requires DATA_BACKEND=rama');
}

export async function searchTournamentEditorUsers(
  query: string,
  limit = 25,
): Promise<Array<{ steamId: string; name: string; avatar: string | null }>> {
  return null;
}

export async function getEventDraft(draftId: number): Promise<EventDraftDetail> {
  return null;
}

export async function getEventDraftRevisions(draftId: number): Promise<EventRevisionSummary[]> {
  return [];
}

export async function createEventDraft(
  input: { name: string; type: EventDraftPayload['type'] },
  actor: EventEditorActor,
): Promise<EventDraftDetail> {
  throw new Error('createEventDraft is not available under Rama');
}

export async function cloneEventToDraft(
  eventId: number,
  actor: EventEditorActor,
): Promise<EventDraftDetail> {
  throw new Error('cloneEventToDraft is not available under Rama');
}

export async function saveEventDraft(input: {
  draftId: number;
  expectedRevision: number;
  payload: EventDraftPayload;
  actor: EventEditorActor;
}): Promise<EventDraftDetail> {
  throw new Error('saveEventDraft is not available under Rama');
}

async function validateDatabaseReferences(payload: EventDraftPayload): Promise<ValidationIssue[]> {
  return [];
}

/** @lintignore Soft-stub / cutover API surface */
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

async function clearEventGraph(tx: unknown, eventId: number): Promise<void> {
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
  tx: unknown,
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
  return 0;
}

export async function restoreEventRevision(input: {
  draftId: number;
  revisionId: number;
  expectedRevision: number;
  actor: EventEditorActor;
}): Promise<{ eventId: number; publishedRevision: number; draftRevision: number }> {
  return 0;
}

export async function importHistoricalEventDrafts(
  actor: EventEditorActor,
): Promise<{ imported: number; existing: number }> {
  return 0;
}
