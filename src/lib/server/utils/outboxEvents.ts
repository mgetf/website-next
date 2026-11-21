/**
 * Contract between the site and the Discord bot.
 *
 * The site writes OutboxEvent rows; the bot claims them over
 * `POST /api/v1/bot/outbox/claim`, sends them, and acks each one with
 * `POST /api/v1/bot/outbox/:id/ack`. The bot copies these shapes, so change them
 * together. Every row is for exactly one target, which makes retries per person.
 */

export type OutboxChannel = 'staff' | 'playoffs';

/** Channel IDs a region has set. Null means use the bot's default for that kind. */
export type OutboxChannelIds = Record<OutboxChannel, string | null>;

export type OutboxTarget =
  | { type: 'dm'; discordId: string; steamId: string }
  | {
      type: 'channel';
      channel: OutboxChannel;
      /** The region's own channel. When absent the bot uses its default for `channel`. */
      channelId?: string | null;
    };

export type OutboxTeamRef = { id: number; name: string };

type Base = {
  target: OutboxTarget;
  /** For DMs: where to mention the person when their DMs are closed. */
  fallbackChannel?: OutboxChannel;
  /** The region's own channel for `fallbackChannel`, when it has one. */
  fallbackChannelId?: string | null;
  /** Absolute link the message points at. */
  url: string;
  division: string;
};

type MatchFields = {
  round: string | null;
  home: OutboxTeamRef;
  away: OutboxTeamRef;
};

export type MatchCreatedPayload = Base &
  MatchFields & {
    bestOf: number;
    arenaGames: number;
    /** Which side the recipient plays on; null for channel posts. */
    recipientSide: 'home' | 'away' | null;
  };

export type ScoreSubmittedPayload = Base &
  MatchFields & {
    submittedByTeam: string;
    winnerName: string;
    /** "2-1", winner first. */
    score: string;
    /** ISO time the report confirms itself if nobody answers. */
    autoConfirmAt: string;
  };

export type ScoreConfirmedPayload = Base &
  MatchFields & {
    winnerName: string;
    loserName: string;
    score: string;
    /** True when nobody answered in time and the report confirmed itself. */
    auto: boolean;
  };

export type ScoreDisputedPayload = Base &
  MatchFields & {
    disputedByTeam: string;
    reason: string | null;
  };

export type TeamEliminatedPayload = Base & {
  teamName: string;
  eliminatedBy: string;
};

export type BracketCompletePayload = Base & {
  podium: Array<{ place: number; name: string }>;
};

export type MatchReminderPayload = Base &
  MatchFields & {
    /** ISO time the match is scheduled for. */
    startsAt: string;
    /** How close the match is: roughly a day out, or within the hour. */
    stage: '24h' | '1h';
    recipientSide: 'home' | 'away';
  };

export const OUTBOX_KINDS = {
  matchReminder: 'match.reminder',
  matchCreated: 'playoff.match_created',
  scoreSubmitted: 'playoff.score_submitted',
  scoreConfirmed: 'playoff.score_confirmed',
  scoreDisputed: 'playoff.score_disputed',
  teamEliminated: 'playoff.team_eliminated',
  bracketComplete: 'playoff.bracket_complete',
} as const;

export type OutboxKind = (typeof OUTBOX_KINDS)[keyof typeof OUTBOX_KINDS];

export type OutboxPayloadByKind = {
  'match.reminder': MatchReminderPayload;
  'playoff.match_created': MatchCreatedPayload;
  'playoff.score_submitted': ScoreSubmittedPayload;
  'playoff.score_confirmed': ScoreConfirmedPayload;
  'playoff.score_disputed': ScoreDisputedPayload;
  'playoff.team_eliminated': TeamEliminatedPayload;
  'playoff.bracket_complete': BracketCompletePayload;
};

/** What the bot reports back for one claimed event. */
export type OutboxAckResult = 'delivered' | 'retry' | 'dead';

export const OUTBOX_MAX_ATTEMPTS = 8;
/** A claimed row nobody acked within this long goes back to the queue. */
export const OUTBOX_LEASE_SECONDS = 120;

/** Delay before attempt N+1 after N failures: 10s, 20s, 40s … capped at 30 minutes. */
export function outboxRetryDelaySeconds(attempts: number): number {
  return Math.min(10 * 2 ** Math.max(0, attempts - 1), 30 * 60);
}
