/**
 * Admin Tournament Editor — Draft Contract
 *
 * Client-safe shapes for the editable event draft. The same payload shape is
 * stored in `EventDraft.payload`, rendered by the live preview, and consumed
 * by the publish transaction in `$lib/server/services/eventEditor.ts`.
 *
 * Every match/stage/participant carries a stable string `id` that is local to
 * the draft. IDs that look like DB row numbers (e.g. "482") refer to an
 * existing published row and will be updated in place on publish. IDs
 * prefixed with "new-" are newly created rows.
 */

import type { EventType, EventStatus } from './event';
import type { BracketData } from './bracket';

export type DraftMatchStatus = 'UNPLAYED' | 'PLAYED' | 'DISPUTE';
export type BracketFormat = 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'CARD';
export type BracketSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';
export type MatchSide = 1 | 2;

export interface DraftParticipant {
  id: string;
  steamId: string | null;
  displayName: string;
  seed: number | null;
  eliminated: boolean;
  hidden: boolean;
}

export interface DraftPlacement {
  id: string;
  participantId: string;
  placement: number;
}

export interface DraftMatchPlayer {
  side: MatchSide;
  participantId: string | null;
  steamId: string | null;
  displayName: string;
}

export interface DraftGame {
  id: string;
  gameNumber: number;
  side1Score: number | null;
  side2Score: number | null;
  arenaId: number | null;
  playedAt: string | null;
}

export interface DraftMatchBase {
  id: string;
  orderNum: number;
  round: number | null;
  label: string | null;
  boSeries: number;
  status: DraftMatchStatus;
  winnerSide: MatchSide | null;
  side1Score: number | null;
  side2Score: number | null;
  players: DraftMatchPlayer[];
  games: DraftGame[];
}

export interface DraftEliminationMatch extends DraftMatchBase {
  section: BracketSection;
  winnerNextMatchId: string | null;
  winnerNextSide: MatchSide | null;
  loserNextMatchId: string | null;
  loserNextSide: MatchSide | null;
}

export type DraftRoundRobinMatch = DraftMatchBase;
export type DraftCardMatch = DraftMatchBase;

interface DraftStageBase {
  id: string;
  name: string;
  orderNum: number;
}

export interface DraftEliminationStage extends DraftStageBase {
  bracketFormat: 'SINGLE_ELIM' | 'DOUBLE_ELIM';
  matches: DraftEliminationMatch[];
}

export interface DraftRoundRobinStage extends DraftStageBase {
  bracketFormat: 'ROUND_ROBIN';
  matches: DraftRoundRobinMatch[];
}

export interface DraftCardStage extends DraftStageBase {
  bracketFormat: 'CARD';
  matches: DraftCardMatch[];
}

export type DraftStage = DraftEliminationStage | DraftRoundRobinStage | DraftCardStage;

export interface EventDraftPayload {
  name: string;
  type: EventType;
  status: EventStatus;
  isTeamEvent: boolean;
  description: string | null;
  avatar: string | null;
  startedAt: string | null;
  endedAt: string | null;
  prizepool: number;
  card: string | null;
  bracketLink: string | null;
  stages: DraftStage[];
  participants: DraftParticipant[];
  placements: DraftPlacement[];
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface TournamentEditorListItem {
  eventId: number | null;
  draftId: number | null;
  name: string;
  type: EventType;
  status: EventStatus;
  startedAt: string | null;
  draftRevision: number | null;
  draftUpdatedAt: string | null;
  validationIssues: number;
  stageCount: number;
  matchCount: number;
}

export interface EventDraftDetail {
  draftId: number;
  eventId: number | null;
  revision: number;
  updatedAt: string;
  payload: EventDraftPayload;
}

export interface EventDraftPreview {
  issues: ValidationIssue[];
  brackets: Array<{
    stageId: string;
    stageName: string;
    data: BracketData;
  }>;
}

export interface EventRevisionSummary {
  id: number;
  revision: number;
  publishedAt: string;
  publishedByName: string | null;
  summary: string | null;
}

let idCounter = 0;

/** Generates a stable, unique draft-local id for newly created rows. */
export function nextDraftId(prefix: string): string {
  idCounter += 1;
  return `new-${prefix}-${Date.now()}-${idCounter}`;
}

export function createEmptyDraftPayload(): EventDraftPayload {
  return {
    name: '',
    type: 'CUP',
    status: 'UPCOMING',
    isTeamEvent: false,
    description: null,
    avatar: null,
    startedAt: null,
    endedAt: null,
    prizepool: 0,
    card: null,
    bracketLink: null,
    stages: [],
    participants: [],
    placements: [],
  };
}

export function normalizeLegacyEventDraftPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const payload = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(payload.participants)) return payload;

  const participants = payload.participants
    .filter(
      (participant): participant is Record<string, unknown> =>
        participant !== null && typeof participant === 'object',
    )
    .map((participant, index) => ({
      ...participant,
      id:
        typeof participant.id === 'string' && participant.id
          ? participant.id
          : `legacy-participant-${index + 1}`,
      steamId: typeof participant.steamId === 'string' ? participant.steamId : null,
      displayName:
        typeof participant.displayName === 'string' && participant.displayName.trim()
          ? participant.displayName.trim()
          : typeof participant.steamId === 'string'
            ? participant.steamId
            : `Participant ${index + 1}`,
      seed: typeof participant.seed === 'number' ? participant.seed : null,
      eliminated: participant.eliminated === true,
      hidden: participant.hidden === true,
    }));
  const participantIds = new Set(participants.map((participant) => participant.id));
  let generatedParticipantIndex = participants.length;

  function ensureParticipant(
    steamId: unknown,
    displayName: unknown,
    preferredId?: unknown,
  ): string | null {
    const normalizedSteamId = typeof steamId === 'string' && steamId.trim() ? steamId.trim() : null;
    const normalizedDisplayName =
      typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;
    if (!normalizedSteamId && normalizedDisplayName?.toLocaleLowerCase() === 'bye') return null;
    if (!normalizedSteamId && !normalizedDisplayName) return null;

    const participant = participants.find((candidate) => {
      if (normalizedSteamId) return candidate.steamId === normalizedSteamId;
      return (
        candidate.displayName.toLocaleLowerCase() === normalizedDisplayName?.toLocaleLowerCase()
      );
    });
    if (participant) return participant.id;

    generatedParticipantIndex += 1;
    const requestedId =
      typeof preferredId === 'string' && preferredId.trim() ? preferredId.trim() : null;
    const id =
      requestedId && !participantIds.has(requestedId)
        ? requestedId
        : `legacy-participant-${generatedParticipantIndex}`;
    participantIds.add(id);
    participants.push({
      id,
      steamId: normalizedSteamId,
      displayName: normalizedDisplayName ?? normalizedSteamId!,
      seed: null,
      eliminated: false,
      hidden: false,
    });
    return id;
  }

  if (Array.isArray(payload.stages)) {
    payload.stages = payload.stages.map((stage) => {
      if (!stage || typeof stage !== 'object') return stage;
      const stageRecord = stage as Record<string, unknown>;
      if (!Array.isArray(stageRecord.matches)) return stageRecord;
      return {
        ...stageRecord,
        matches: stageRecord.matches.map((match) => {
          if (!match || typeof match !== 'object') return match;
          const matchRecord = match as Record<string, unknown>;
          if (!Array.isArray(matchRecord.players)) return matchRecord;
          return {
            ...matchRecord,
            players: matchRecord.players.map((player) => {
              if (!player || typeof player !== 'object') return player;
              const playerRecord = player as Record<string, unknown>;
              if (
                typeof playerRecord.participantId === 'string' &&
                participantIds.has(playerRecord.participantId)
              ) {
                return playerRecord;
              }
              return {
                ...playerRecord,
                participantId: ensureParticipant(
                  playerRecord.steamId,
                  playerRecord.displayName,
                  typeof matchRecord.id === 'string' && typeof playerRecord.side === 'number'
                    ? `legacy-match-${matchRecord.id}-side-${playerRecord.side}`
                    : undefined,
                ),
              };
            }),
          };
        }),
      };
    });
  }

  if (Array.isArray(payload.placements)) {
    payload.placements = payload.placements.map((placement) => {
      if (!placement || typeof placement !== 'object') return placement;
      const record = placement as Record<string, unknown>;
      if (typeof record.participantId === 'string' && participantIds.has(record.participantId)) {
        return record;
      }
      return {
        ...record,
        participantId: ensureParticipant(
          record.steamId,
          record.displayName,
          typeof record.id === 'string' ? `legacy-placement-${record.id}` : undefined,
        ),
      };
    });
  }

  payload.participants = participants;
  return payload;
}
