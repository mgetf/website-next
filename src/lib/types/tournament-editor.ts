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
  steamId: string;
  displayName: string;
  seed: number | null;
  eliminated: boolean;
  hidden: boolean;
}

export interface DraftPlacement {
  id: string;
  steamId: string;
  placement: number;
}

export interface DraftMatchPlayer {
  side: MatchSide;
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

export interface EventDraftSummary {
  draftId: number;
  eventId: number | null;
  eventName: string;
  eventType: EventType;
  revision: number;
  updatedAt: string;
  updatedByName: string | null;
  isPublished: boolean;
  stageCount: number;
  matchCount: number;
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
