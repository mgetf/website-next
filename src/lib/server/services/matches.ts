/**
 * Match Management Service
 * Core business logic for league matches (2v2 and 1v1)
 */

import { prisma } from '#lib/server/db.js';
import type { Match, Game, Team, Prisma } from '#prisma/client.js';
import { MatchStatus, ScoreSubmissionStatus } from '#prisma/client.js';
import { notFound, badRequest, forbidden } from '#lib/server/utils/errors.js';
import { UserRole } from '#lib/types/user.js';
import { formatPlayoffSlotLabel, type PlayoffSlotSection } from '#lib/utils/playoffs.js';
import { discordRecipients, enqueueOutbox, regionChannels, siteUrl } from './outbox';
import { scoreDisputedItems, scoreSubmittedItems } from '#lib/server/utils/playoffEvents.js';
import { calculateWeekLabel } from '#lib/server/utils/matchHelpers.js';
import {
  calculateMatchWinner,
  canUserManageMatch,
  isTeamManager,
  validateScoreSubmission,
  type GameResult,
} from '#lib/server/utils/matchScoring.js';
import { FORMAT_1V1 } from '#lib/server/constants/formats.js';
import { createNotificationForTeamOwners, createNotificationForAdmins } from './notifications';
import { advancePlayoffFromMatch, notifyNewPlayoffMatches } from './playoffSlots';

export { calculateMatchWinner, canUserManageMatch, validateScoreSubmission };
export type { GameResult };

/**
 * Get complete match details with all relations
 */
export async function getMatchDetails(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: {
        include: {
          division: true,
          region: true,
          format: { select: { name: true, themeKey: true, iconUrl: true, isIndividual: true } },
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      awayTeam: {
        include: {
          division: true,
          region: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      season: {
        include: {
          region: true,
        },
      },
      playoff: true,
      games: {
        include: {
          arena: true,
        },
        orderBy: { gameNum: 'asc' },
      },
      matchComms: {
        include: {
          user: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      matchMapBans: {
        include: {
          pool: {
            include: {
              mapsInPool: {
                include: {
                  arena: true,
                },
                orderBy: { orderNum: 'asc' },
              },
            },
          },
          actions: {
            include: {
              team: true,
              player: true,
              arena: true,
            },
            orderBy: { actionOrder: 'asc' },
          },
        },
      },
      demos: {
        include: {
          player: true,
          submitter: true,
        },
        orderBy: { submittedAt: 'desc' },
      },
      submitter: true,
    },
  });

  if (!match) {
    notFound('Match not found');
  }

  // Check if this is a 1v1 match and add player info
  const is1v1 = match.homeTeam.formatId === FORMAT_1V1;

  if (is1v1) {
    // Get the active player from each "team" (there should only be one)
    const homePlayer = match.homeTeam.players[0]?.player || null;
    const awayPlayer = match.awayTeam.players[0]?.player || null;

    return {
      ...match,
      is1v1: true,
      homePlayer,
      awayPlayer,
    };
  }

  return {
    ...match,
    is1v1: false,
    homePlayer: null,
    awayPlayer: null,
  };
}

/**
 * Calculate week label for a match by finding all matches for the HOME team in that week
 * Returns the label (e.g., "1", "1a", "1b") or null if no week number
 * Note: Label is calculated from home team's perspective for consistency
 */
export async function getMatchWeekLabel(match: Match): Promise<string | null> {
  if (match.weekNo === null || match.weekNo === undefined) {
    return null;
  }

  // Get all matches for the HOME team in this week
  // This ensures consistent labeling from one team's perspective
  const homeTeamMatchesForThisWeek = await prisma.match.findMany({
    where: {
      seasonId: match.seasonId,
      weekNo: match.weekNo,
      playoffId: null,
      OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  return calculateWeekLabel(match, homeTeamMatchesForThisWeek);
}

/**
 * Calculate week labels for multiple matches
 * More efficient than calling getMatchWeekLabel multiple times
 */
export async function getMatchWeekLabels(matches: Match[]): Promise<Map<number, string | null>> {
  const labels = new Map<number, string | null>();

  for (const match of matches) {
    const label = await getMatchWeekLabel(match);
    labels.set(match.id, label);
  }

  return labels;
}

const AUTO_CONFIRM_HOURS = 24;

type AppliedScores = {
  winnerId: number | null;
  winnerScore: number;
  loserScore: number;
  homeTeamId: number;
  awayTeamId: number;
  createdMatches: Awaited<ReturnType<typeof advancePlayoffFromMatch>>;
};

/**
 * Write a decided result: games, team records, the match itself, and the next
 * playoff matches. The caller holds the match row lock.
 */
async function applyScoresInTx(
  tx: Prisma.TransactionClient,
  matchId: number,
  gameResults: GameResult[],
  submittedBy: string,
  options: { auto?: boolean } = {},
): Promise<AppliedScores> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true, games: true },
  });

  if (!match) notFound('Match not found');

  const { winnerId, winnerScore, loserScore, homePointsScored, awayPointsScored } =
    calculateMatchWinner(match.homeTeamId, match.awayTeamId, gameResults, match.boGames);

  for (const r of gameResults) {
    await tx.game.updateMany({
      where: { matchId, gameNum: r.gameNum },
      data: {
        homeTeamScore: r.homeScore,
        awayTeamScore: r.awayScore,
        arenaId: r.arenaId || null,
      },
    });
  }

  await tx.team.update({
    where: { id: match.homeTeamId },
    data: {
      wins: { increment: winnerId === match.homeTeamId ? 1 : 0 },
      losses: { increment: winnerId === match.awayTeamId ? 1 : 0 },
      gamesWon: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
      gamesLost: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
      pointsScored: { increment: homePointsScored },
      pointsScoredAgainst: { increment: awayPointsScored },
    },
  });

  await tx.team.update({
    where: { id: match.awayTeamId },
    data: {
      wins: { increment: winnerId === match.awayTeamId ? 1 : 0 },
      losses: { increment: winnerId === match.homeTeamId ? 1 : 0 },
      gamesWon: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
      gamesLost: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
      pointsScored: { increment: awayPointsScored },
      pointsScoredAgainst: { increment: homePointsScored },
    },
  });

  await tx.match.update({
    where: { id: matchId },
    data: {
      winnerId,
      winnerScore,
      loserScore,
      status: MatchStatus.PLAYED,
      submittedBy,
      submittedAt: new Date(),
    },
  });

  await tx.matchComm.updateMany({
    where: { matchId, rescheduleStatus: 0 },
    data: { rescheduleStatus: 3 }, // Canceled
  });

  const createdMatches = await advancePlayoffFromMatch(tx, matchId, options);

  return {
    winnerId,
    winnerScore,
    loserScore,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    createdMatches,
  };
}

async function lockMatch(tx: Prisma.TransactionClient, matchId: number) {
  const rows = await tx.$queryRaw<{ id: number; status: string }[]>`
    SELECT id, status FROM matches WHERE id = ${matchId} FOR UPDATE
  `;
  const locked = rows[0];
  if (!locked) notFound('Match not found');
  return locked;
}

/** Names, round and link for a playoff match, for outbox messages. */
async function playoffMatchContext(tx: Prisma.TransactionClient, matchId: number) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      homeTeam: {
        select: { id: true, name: true, regionId: true, division: { select: { name: true } } },
      },
      awayTeam: { select: { id: true, name: true } },
      playoffSlot: { select: { section: true, round: true, seasonId: true, divisionId: true } },
    },
  });
  if (!match) notFound('Match not found');

  let round: string | null = null;
  const slot = match.playoffSlot;
  if (slot) {
    const highest = await tx.playoffSlot.aggregate({
      where: { seasonId: slot.seasonId, divisionId: slot.divisionId, section: slot.section },
      _max: { round: true },
    });
    round = formatPlayoffSlotLabel(
      slot.section as PlayoffSlotSection,
      slot.round,
      highest._max.round ?? slot.round,
    );
  }

  return {
    id: match.id,
    division: match.homeTeam.division?.name ?? 'Playoffs',
    round,
    home: { id: match.homeTeam.id, name: match.homeTeam.name },
    away: { id: match.awayTeam.id, name: match.awayTeam.name },
    url: siteUrl(`/matches/${match.id}`),
    channels: match.homeTeam.regionId
      ? await regionChannels(tx, match.homeTeam.regionId)
      : { playoffs: null, staff: null },
  };
}

export type SubmitScoresResult = {
  winnerId: number | null;
  winnerScore: number;
  loserScore: number;
  /** True when the other team still has to confirm. The match is not played yet. */
  pending: boolean;
};

/**
 * Submit match scores.
 *
 * Playoff matches reported by one of the two teams wait for the other team to
 * confirm; nothing moves until they do. Everything else, including a result
 * entered by staff, is applied right away.
 */
export async function submitMatchScores(
  matchId: number,
  gameResults: GameResult[],
  submittedBy: string,
): Promise<SubmitScoresResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    // Lock the match row for the duration of this transaction so concurrent
    // submissions cannot both pass the UNPLAYED check simultaneously.
    const locked = await lockMatch(tx, matchId);
    if (locked.status !== 'UNPLAYED') {
      badRequest('Match scores have already been submitted');
    }

    const slot = await tx.playoffSlot.findUnique({ where: { matchId }, select: { id: true } });
    if (slot) {
      const proposed = await proposePlayoffScores(tx, matchId, gameResults, submittedBy);
      if (proposed) return { pending: true as const, ...proposed };
    }

    return {
      pending: false as const,
      ...(await applyScoresInTx(tx, matchId, gameResults, submittedBy)),
    };
  });

  if (outcome.pending) {
    return {
      winnerId: outcome.winnerId,
      winnerScore: outcome.winnerScore,
      loserScore: outcome.loserScore,
      pending: true,
    };
  }

  await afterScoresApplied(matchId, outcome, submittedBy, 'Score submitted');
  return {
    winnerId: outcome.winnerId,
    winnerScore: outcome.winnerScore,
    loserScore: outcome.loserScore,
    pending: false,
  };
}

/** In-app notifications that run after the result is committed. */
async function afterScoresApplied(
  matchId: number,
  result: AppliedScores,
  actor: string | null,
  prefix: string,
) {
  await notifyNewPlayoffMatches(result.createdMatches);

  const actorTeam = actor
    ? await prisma.playerInTeam.findFirst({
        where: {
          playerSteamId: actor,
          teamId: { in: [result.homeTeamId, result.awayTeamId] },
          active: 1,
        },
      })
    : null;
  const notifyTeam = actorTeam
    ? actorTeam.teamId === result.homeTeamId
      ? result.awayTeamId
      : result.homeTeamId
    : null;

  if (notifyTeam != null) {
    await createNotificationForTeamOwners(
      [notifyTeam],
      'MATCH_COMM',
      `/matches/${matchId}`,
      `${prefix}: ${result.winnerScore}-${result.loserScore}`,
      actor ?? undefined,
    );
  }
}

/**
 * Park a team's report until the other team answers. Returns null when the
 * submitter is not on either team (staff), so the caller applies it directly.
 */
async function proposePlayoffScores(
  tx: Prisma.TransactionClient,
  matchId: number,
  gameResults: GameResult[],
  submittedBy: string,
) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: { include: { players: { where: { active: 1 } } } },
      awayTeam: { include: { players: { where: { active: 1 } } } },
    },
  });
  if (!match) notFound('Match not found');

  const submitterTeamId = isTeamManager(match.homeTeam, submittedBy)
    ? match.homeTeamId
    : isTeamManager(match.awayTeam, submittedBy)
      ? match.awayTeamId
      : null;
  if (submitterTeamId == null) return null;

  const { winnerId, winnerScore, loserScore } = calculateMatchWinner(
    match.homeTeamId,
    match.awayTeamId,
    gameResults,
    match.boGames,
  );
  if (winnerId == null) badRequest('A playoff match needs a winner');

  const open = await tx.matchScoreSubmission.findFirst({
    where: { matchId, status: ScoreSubmissionStatus.PENDING },
  });
  if (open) {
    if (open.submittedByTeam !== submitterTeamId) {
      badRequest(
        'The other team already reported a score. Confirm it or dispute it instead of reporting again.',
      );
    }
    await tx.matchScoreSubmission.update({
      where: { id: open.id },
      data: { status: ScoreSubmissionStatus.SUPERSEDED, resolvedAt: new Date() },
    });
  }

  const autoConfirmAt = new Date(Date.now() + AUTO_CONFIRM_HOURS * 3600 * 1000);
  const submission = await tx.matchScoreSubmission.create({
    data: {
      matchId,
      submittedBy,
      submittedByTeam: submitterTeamId,
      gameResults: gameResults as unknown as Prisma.InputJsonValue,
      autoConfirmAt,
    },
  });

  const opposingTeamId = submitterTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  const context = await playoffMatchContext(tx, matchId);
  const names = new Map([
    [context.home.id, context.home.name],
    [context.away.id, context.away.name],
  ]);
  await enqueueOutbox(
    tx,
    scoreSubmittedItems(
      context,
      {
        id: submission.id,
        submittedByTeam: names.get(submitterTeamId) ?? 'The other team',
        winnerName: names.get(winnerId) ?? 'Winner',
        score: `${winnerScore}-${loserScore}`,
        autoConfirmAt,
      },
      await discordRecipients(tx, [opposingTeamId], { managersOnly: true }),
    ),
  );

  return { winnerId, winnerScore, loserScore };
}

/** The report waiting on the other team, if any. */
export async function getPendingScoreSubmission(matchId: number) {
  return prisma.matchScoreSubmission.findFirst({
    where: { matchId, status: ScoreSubmissionStatus.PENDING },
    select: {
      id: true,
      submittedBy: true,
      submittedByTeam: true,
      gameResults: true,
      createdAt: true,
      autoConfirmAt: true,
    },
  });
}

/** Staff may answer for anyone; otherwise it must be a manager of the team that did not report. */
async function assertCanAnswerSubmission(
  tx: Prisma.TransactionClient,
  matchId: number,
  submittedByTeam: number,
  steamId: string,
) {
  const [user, match] = await Promise.all([
    tx.user.findUnique({ where: { steamId }, select: { permissionLevel: true } }),
    tx.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { include: { players: { where: { active: 1 } } } },
        awayTeam: { include: { players: { where: { active: 1 } } } },
      },
    }),
  ]);
  if (!match) notFound('Match not found');
  if (user?.permissionLevel === UserRole.ADMIN || user?.permissionLevel === UserRole.MODERATOR) {
    return;
  }
  const answering = submittedByTeam === match.homeTeamId ? match.awayTeam : match.homeTeam;
  if (!isTeamManager(answering, steamId)) {
    forbidden('Only a leader of the other team can answer this score');
  }
}

export type ConfirmScoreResult = { confirmed: boolean };

/**
 * Confirm the waiting report. This is what moves the bracket forward.
 * Safe to repeat: a second call for an already played match does nothing.
 * `confirmedBy` is null for the automatic confirmation after the deadline.
 */
export async function confirmMatchScore(
  matchId: number,
  confirmedBy: string | null,
  options: { auto?: boolean } = {},
): Promise<ConfirmScoreResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await lockMatch(tx, matchId);
    const submission = await tx.matchScoreSubmission.findFirst({
      where: { matchId, status: ScoreSubmissionStatus.PENDING },
    });

    if (!submission) {
      if (locked.status === 'PLAYED') return null;
      badRequest('There is no score waiting for confirmation');
    }
    if (locked.status !== 'UNPLAYED') {
      // Staff entered a result while this was waiting.
      await tx.matchScoreSubmission.update({
        where: { id: submission.id },
        data: { status: ScoreSubmissionStatus.SUPERSEDED, resolvedAt: new Date() },
      });
      return null;
    }

    if (!options.auto) {
      if (!confirmedBy) forbidden('Sign in to confirm a score');
      await assertCanAnswerSubmission(tx, matchId, submission.submittedByTeam, confirmedBy);
    }

    const applied = await applyScoresInTx(
      tx,
      matchId,
      submission.gameResults as unknown as GameResult[],
      submission.submittedBy,
      { auto: options.auto },
    );
    await tx.matchScoreSubmission.update({
      where: { id: submission.id },
      data: {
        status: ScoreSubmissionStatus.CONFIRMED,
        resolvedAt: new Date(),
        resolvedBy: confirmedBy,
        autoConfirmed: options.auto === true,
      },
    });
    return { applied, submittedBy: submission.submittedBy };
  });

  if (!outcome) return { confirmed: false };
  await afterScoresApplied(
    matchId,
    outcome.applied,
    options.auto ? outcome.submittedBy : confirmedBy,
    options.auto ? 'Score confirmed automatically' : 'Score confirmed',
  );
  return { confirmed: true };
}

/** Reject the waiting report. The match goes to staff as a dispute. */
export async function disputeScoreSubmission(
  matchId: number,
  disputedBy: string,
  reason: string | null,
) {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockMatch(tx, matchId);
    const submission = await tx.matchScoreSubmission.findFirst({
      where: { matchId, status: ScoreSubmissionStatus.PENDING },
    });
    if (!submission || locked.status !== 'UNPLAYED') {
      badRequest('There is no score waiting for confirmation');
    }

    await assertCanAnswerSubmission(tx, matchId, submission.submittedByTeam, disputedBy);

    await tx.matchScoreSubmission.update({
      where: { id: submission.id },
      data: {
        status: ScoreSubmissionStatus.DISPUTED,
        resolvedAt: new Date(),
        resolvedBy: disputedBy,
      },
    });
    await tx.match.update({ where: { id: matchId }, data: { status: MatchStatus.DISPUTE } });
    await tx.matchComm.create({
      data: {
        matchId,
        owner: disputedBy,
        content: `SCORE DISPUTED${reason ? `: ${reason}` : ''}`,
        createdAt: new Date(),
      },
    });

    const context = await playoffMatchContext(tx, matchId);
    const disputer =
      submission.submittedByTeam === context.home.id ? context.away.name : context.home.name;
    await enqueueOutbox(
      tx,
      scoreDisputedItems(
        context,
        { submissionId: submission.id, disputedByTeam: disputer, reason },
        await discordRecipients(tx, [submission.submittedByTeam], { managersOnly: true }),
      ),
    );

    return { submittedByTeam: submission.submittedByTeam };
  });

  await createNotificationForAdmins(
    'MATCH_COMM',
    `/matches/${matchId}`,
    `Score disputed${reason ? `: ${reason.slice(0, 50)}` : ''}`,
    disputedBy,
  );
  await createNotificationForTeamOwners(
    [result.submittedByTeam],
    'MATCH_COMM',
    `/matches/${matchId}`,
    'The other team disputed your reported score',
    disputedBy,
  );
}

/**
 * Confirm every report whose deadline passed with no answer.
 * The bot's poll triggers this, so no separate scheduler is needed.
 */
export async function autoConfirmDueSubmissions(limit = 20): Promise<number> {
  const due = await prisma.matchScoreSubmission.findMany({
    where: { status: ScoreSubmissionStatus.PENDING, autoConfirmAt: { lte: new Date() } },
    select: { matchId: true },
    orderBy: { autoConfirmAt: 'asc' },
    take: limit,
  });

  let confirmed = 0;
  for (const { matchId } of due) {
    try {
      const result = await confirmMatchScore(matchId, null, { auto: true });
      if (result.confirmed) confirmed += 1;
    } catch (err) {
      console.error(`[autoConfirm] match ${matchId} failed:`, err);
    }
  }
  return confirmed;
}

/**
 * File a match dispute
 * Must be within 24 hours of submission
 */
export async function disputeMatch(matchId: number, reason: string, disputedBy: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    notFound('Match not found');
  }

  if (match.status !== MatchStatus.PLAYED) {
    badRequest('Can only dispute played matches');
  }

  if (!match.submittedAt) {
    badRequest('No submission timestamp found');
  }

  const now = Date.now();
  const submittedTime = match.submittedAt.getTime();
  const hoursSinceSubmission = (now - submittedTime) / (1000 * 3600);

  if (hoursSinceSubmission > 24) {
    badRequest('Dispute period has passed (24 hours)');
  }

  // Update match status to DISPUTE
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: MatchStatus.DISPUTE,
    },
  });

  // Create dispute message
  await prisma.matchComm.create({
    data: {
      matchId,
      owner: disputedBy,
      content: `MATCH DISPUTED: ${reason}`,
      createdAt: new Date(),
    },
  });

  // Notify admins about the dispute
  await createNotificationForAdmins(
    'MATCH_COMM',
    `/matches/${matchId}`,
    `Match disputed: ${reason.substring(0, 50)}${reason.length > 50 ? '...' : ''}`,
    disputedBy,
  );

  // Determine which team the disputer is on to notify the opposing team
  const disputerTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: disputedBy,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
      active: 1,
    },
  });

  if (disputerTeam) {
    const opposingTeamId =
      disputerTeam.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    // Notify opposing team about the dispute
    await createNotificationForTeamOwners(
      [opposingTeamId],
      'MATCH_COMM',
      `/matches/${matchId}`,
      'Match has been disputed',
      disputedBy,
    );
  }
}
