/**
 * Validation Utilities using Zod
 * Common validation schemas and helpers
 */

import { z } from 'zod';
import {
  normalizeLegacyEventDraftPayload,
  type EventDraftPayload,
  type ValidationIssue,
} from '$lib/types/tournament-editor';
import { validateDraftStructure } from '$lib/utils/tournamentDraftValidation';

// ===== Common Field Schemas =====

/**
 * Extract validation errors into a flat object
 * { fieldName: errorMessage }
 */
export function formatValidationErrors(errors: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};

  errors.issues.forEach((issue) => {
    const path = issue.path.join('.');
    formatted[path] = issue.message;
  });

  return formatted;
}

const nullableText = z.string().trim().nullable();
const nullableUrl = z.union([z.url(), z.literal(''), z.null()]).transform((value) => value || null);
const nullableDateTime = z.string().trim().nullable();
const nullableScore = z.number().int().nonnegative().nullable();
const matchSide = z.union([z.literal(1), z.literal(2)]);

const draftPlayerSchema = z.object({
  side: matchSide,
  participantId: nullableText,
  steamId: nullableText,
  displayName: z.string().trim().min(1, 'Player display name is required'),
});

const draftGameSchema = z.object({
  id: z.string().min(1),
  gameNumber: z.number().int().positive(),
  side1Score: nullableScore,
  side2Score: nullableScore,
  arenaId: z.number().int().positive().nullable(),
  playedAt: nullableDateTime,
});

const matchBaseShape = {
  id: z.string().min(1),
  orderNum: z.number().int().nonnegative(),
  round: z.number().int().nullable(),
  label: nullableText,
  boSeries: z.number().int().positive(),
  status: z.enum(['UNPLAYED', 'PLAYED', 'DISPUTE']),
  winnerSide: matchSide.nullable(),
  side1Score: nullableScore,
  side2Score: nullableScore,
  players: z.array(draftPlayerSchema),
  games: z.array(draftGameSchema),
};

const eliminationMatchSchema = z.object({
  ...matchBaseShape,
  section: z.enum(['MAIN', 'WINNERS', 'LOSERS', 'GRAND_FINAL']),
  winnerNextMatchId: nullableText,
  winnerNextSide: matchSide.nullable(),
  loserNextMatchId: nullableText,
  loserNextSide: matchSide.nullable(),
});

const simpleMatchSchema = z.object(matchBaseShape);

const stageBaseShape = {
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Stage name is required'),
  orderNum: z.number().int().nonnegative(),
};

export const eventDraftStageSchema = z.discriminatedUnion('bracketFormat', [
  z.object({
    ...stageBaseShape,
    bracketFormat: z.literal('SINGLE_ELIM'),
    matches: z.array(eliminationMatchSchema),
  }),
  z.object({
    ...stageBaseShape,
    bracketFormat: z.literal('DOUBLE_ELIM'),
    matches: z.array(eliminationMatchSchema),
  }),
  z.object({
    ...stageBaseShape,
    bracketFormat: z.literal('ROUND_ROBIN'),
    matches: z.array(simpleMatchSchema),
  }),
  z.object({
    ...stageBaseShape,
    bracketFormat: z.literal('CARD'),
    matches: z.array(simpleMatchSchema),
  }),
]);

export const eventDraftPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(160),
  type: z.enum(['CUP', 'CHAMPIONSHIP', 'FIGHT_NIGHT']),
  status: z.enum(['UPCOMING', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED']),
  isTeamEvent: z.boolean(),
  description: nullableText,
  avatar: nullableUrl,
  startedAt: nullableDateTime,
  endedAt: nullableDateTime,
  prizepool: z.number().nonnegative(),
  card: nullableText,
  bracketLink: nullableUrl,
  stages: z.array(eventDraftStageSchema),
  participants: z.array(
    z.object({
      id: z.string().min(1),
      steamId: nullableText,
      displayName: z.string().trim().min(1),
      seed: z.number().int().positive().nullable(),
      eliminated: z.boolean(),
      hidden: z.boolean(),
    }),
  ),
  placements: z.array(
    z.object({
      id: z.string().min(1),
      participantId: z.string().trim().min(1),
      placement: z.number().int().positive(),
    }),
  ),
});

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') return normalizeLegacyEventDraftPayload(value);
  try {
    return normalizeLegacyEventDraftPayload(JSON.parse(value));
  } catch {
    return value;
  }
}

export const eventDraftSaveSchema = z.object({
  payload: z.preprocess(parseJsonPayload, eventDraftPayloadSchema),
  expectedRevision: z.coerce.number().int().positive(),
});

export const eventDraftCreateSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(160),
  type: z.enum(['CUP', 'CHAMPIONSHIP', 'FIGHT_NIGHT']),
});

export const eventDraftCloneSchema = z.object({
  eventId: z.coerce.number().int().positive(),
});

export const eventDraftPublishSchema = eventDraftSaveSchema.extend({
  summary: z.string().trim().max(500).optional().default(''),
});

export const eventRevisionRestoreSchema = z.object({
  revisionId: z.coerce.number().int().positive(),
  expectedRevision: z.coerce.number().int().positive(),
});

export function validateEventDraftPayload(payload: unknown): {
  payload: EventDraftPayload | null;
  issues: ValidationIssue[];
} {
  const parsed = eventDraftPayloadSchema.safeParse(normalizeLegacyEventDraftPayload(payload));
  if (!parsed.success) {
    return {
      payload: null,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        severity: 'error',
      })),
    };
  }

  const typedPayload = parsed.data as EventDraftPayload;
  return { payload: typedPayload, issues: validateDraftStructure(typedPayload) };
}
