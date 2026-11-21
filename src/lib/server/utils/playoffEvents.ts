import {
  OUTBOX_KINDS,
  type BracketCompletePayload,
  type MatchCreatedPayload,
  type OutboxChannel,
  type OutboxChannelIds,
  type OutboxKind,
  type OutboxPayloadByKind,
  type OutboxTeamRef,
  type ScoreConfirmedPayload,
  type ScoreDisputedPayload,
  type ScoreSubmittedPayload,
  type TeamEliminatedPayload,
} from '#lib/server/utils/outboxEvents.js';

/**
 * Builds outbox rows for the playoff flow. Pure: callers resolve teams and the
 * people to tell, so the rules for who hears what live in one testable place.
 * Each row has one target and a dedupe key, so a retried transaction cannot
 * message anyone twice.
 */

export type OutboxItem = {
  kind: OutboxKind;
  dedupeKey: string;
  payload: OutboxPayloadByKind[OutboxKind];
};

export type PlayoffRecipient = {
  steamId: string;
  discordId: string;
  teamId: number;
};

const NO_CHANNELS: OutboxChannelIds = { playoffs: null, staff: null };

type Match = {
  /** The region's channels. Left out, the bot falls back to its own defaults. */
  channels?: OutboxChannelIds;
  id: number;
  division: string;
  round: string | null;
  home: OutboxTeamRef;
  away: OutboxTeamRef;
  url: string;
};

const FALLBACK: OutboxChannel = 'playoffs';

function dmItems<K extends OutboxKind>(
  kind: K,
  keyBase: string,
  recipients: PlayoffRecipient[],
  build: (
    recipient: PlayoffRecipient,
  ) => Omit<OutboxPayloadByKind[K], 'target' | 'fallbackChannel'>,
  channels: OutboxChannelIds = NO_CHANNELS,
): OutboxItem[] {
  const seen = new Set<string>();
  const items: OutboxItem[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.discordId)) continue;
    seen.add(recipient.discordId);
    items.push({
      kind,
      dedupeKey: `${keyBase}:dm:${recipient.discordId}`,
      payload: {
        ...build(recipient),
        target: { type: 'dm', discordId: recipient.discordId, steamId: recipient.steamId },
        fallbackChannel: FALLBACK,
        fallbackChannelId: channels[FALLBACK],
      } as unknown as OutboxPayloadByKind[K],
    });
  }
  return items;
}

function channelItem<K extends OutboxKind>(
  kind: K,
  keyBase: string,
  channel: OutboxChannel,
  body: Omit<OutboxPayloadByKind[K], 'target' | 'fallbackChannel'>,
  channels: OutboxChannelIds = NO_CHANNELS,
): OutboxItem {
  return {
    kind,
    dedupeKey: `${keyBase}:channel:${channel}`,
    payload: {
      ...body,
      target: { type: 'channel', channel, channelId: channels[channel] },
    } as unknown as OutboxPayloadByKind[K],
  };
}

function matchFields(match: Match) {
  return {
    url: match.url,
    division: match.division,
    round: match.round,
    home: match.home,
    away: match.away,
  };
}

export function matchCreatedItems(
  match: Match & { bestOf: number; arenaGames: number },
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  const key = `playoff.match_created:${match.id}`;
  const body = { ...matchFields(match), bestOf: match.bestOf, arenaGames: match.arenaGames };
  return [
    ...dmItems(
      OUTBOX_KINDS.matchCreated,
      key,
      recipients,
      (recipient) => ({
        ...body,
        recipientSide: (recipient.teamId === match.home.id ? 'home' : 'away') as 'home' | 'away',
      }),
      match.channels,
    ),
    channelItem<typeof OUTBOX_KINDS.matchCreated>(
      OUTBOX_KINDS.matchCreated,
      key,
      'playoffs',
      {
        ...body,
        recipientSide: null,
      } satisfies Omit<MatchCreatedPayload, 'target' | 'fallbackChannel'>,
      match.channels,
    ),
  ];
}

/** Tells the team that has to answer. `recipients` are that team's managers. */
export function scoreSubmittedItems(
  match: Match,
  submission: {
    id: number;
    submittedByTeam: string;
    winnerName: string;
    score: string;
    autoConfirmAt: Date;
  },
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  return dmItems(
    OUTBOX_KINDS.scoreSubmitted,
    `playoff.score_submitted:${submission.id}`,
    recipients,
    () =>
      ({
        ...matchFields(match),
        submittedByTeam: submission.submittedByTeam,
        winnerName: submission.winnerName,
        score: submission.score,
        autoConfirmAt: submission.autoConfirmAt.toISOString(),
      }) satisfies Omit<ScoreSubmittedPayload, 'target' | 'fallbackChannel'>,
    match.channels,
  );
}

/** `recipients` are the managers of both teams. */
export function scoreConfirmedItems(
  match: Match,
  result: { winnerName: string; loserName: string; score: string; auto: boolean },
  winnerId: number,
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  const key = `playoff.score_confirmed:${match.id}:${winnerId}-${result.score}`;
  const body = {
    ...matchFields(match),
    winnerName: result.winnerName,
    loserName: result.loserName,
    score: result.score,
    auto: result.auto,
  } satisfies Omit<ScoreConfirmedPayload, 'target' | 'fallbackChannel'>;
  return [
    ...dmItems(OUTBOX_KINDS.scoreConfirmed, key, recipients, () => body, match.channels),
    channelItem<typeof OUTBOX_KINDS.scoreConfirmed>(
      OUTBOX_KINDS.scoreConfirmed,
      key,
      'playoffs',
      body,
      match.channels,
    ),
  ];
}

/** `recipients` are the managers of the team whose report was rejected. */
export function scoreDisputedItems(
  match: Match,
  dispute: { submissionId: number; disputedByTeam: string; reason: string | null },
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  const key = `playoff.score_disputed:${dispute.submissionId}`;
  const body = {
    ...matchFields(match),
    disputedByTeam: dispute.disputedByTeam,
    reason: dispute.reason,
  } satisfies Omit<ScoreDisputedPayload, 'target' | 'fallbackChannel'>;
  return [
    ...dmItems(OUTBOX_KINDS.scoreDisputed, key, recipients, () => body, match.channels),
    channelItem<typeof OUTBOX_KINDS.scoreDisputed>(
      OUTBOX_KINDS.scoreDisputed,
      key,
      'staff',
      body,
      match.channels,
    ),
  ];
}

/** `recipients` are the whole roster of the team that went out. */
export function teamEliminatedItems(
  input: {
    matchId: number;
    teamId: number;
    teamName: string;
    eliminatedBy: string;
    division: string;
    url: string;
    channels?: OutboxChannelIds;
  },
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  return dmItems(
    OUTBOX_KINDS.teamEliminated,
    `playoff.team_eliminated:${input.teamId}:${input.matchId}`,
    recipients,
    () =>
      ({
        url: input.url,
        division: input.division,
        teamName: input.teamName,
        eliminatedBy: input.eliminatedBy,
      }) satisfies Omit<TeamEliminatedPayload, 'target' | 'fallbackChannel'>,
    input.channels,
  );
}

/** `recipients` are everyone on the podium teams. */
export function bracketCompleteItems(
  input: {
    seasonId: number;
    divisionId: number;
    division: string;
    url: string;
    podium: Array<{ place: number; name: string }>;
    channels?: OutboxChannelIds;
  },
  recipients: PlayoffRecipient[],
): OutboxItem[] {
  const key = `playoff.bracket_complete:${input.seasonId}:${input.divisionId}`;
  const body = {
    url: input.url,
    division: input.division,
    podium: input.podium,
  } satisfies Omit<BracketCompletePayload, 'target' | 'fallbackChannel'>;
  return [
    ...dmItems(OUTBOX_KINDS.bracketComplete, key, recipients, () => body, input.channels),
    channelItem<typeof OUTBOX_KINDS.bracketComplete>(
      OUTBOX_KINDS.bracketComplete,
      key,
      'playoffs',
      body,
      input.channels,
    ),
  ];
}

/**
 * Who is eliminated when a playoff match ends. The loser is out when its slot
 * has no loser arrow, unless that match is a grand final the losers champion
 * won and a reset is coming.
 */
export function eliminatedTeamId(input: {
  loserId: number;
  hasLoserArrow: boolean;
  resetCreated: boolean;
}): number | null {
  if (input.hasLoserArrow || input.resetCreated) return null;
  return input.loserId;
}
