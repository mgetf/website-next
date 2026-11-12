/**
 * Forfeit Service
 *
 * Mod-approved forfeit handling. Two cases:
 *
 * 1. SINGLE forfeit — one team forfeits. The other team gets the win (W/L only;
 *    no games or points are recorded, so point averages are unaffected). The
 *    conventional 20-0 scoreline is stored on the match row for display, and
 *    the decision is linked to its source via `ticketRef` (ticket number like
 *    "closed-0856", ticket log channel id, or transcript URL from the discord
 *    tool's fetch_transcript.py).
 *
 * 2. MUTUAL forfeit — both teams agree not to play. Void / no-contest: no W/L,
 *    no games, no points. Recorded as PLAYED with forfeitType MUTUAL and no
 *    winner so it leaves the schedule queue and is distinguishable from a
 *    real result.
 *
 * Both write audit rows (MATCH_FORFEIT_APPROVED / MATCH_FORFEIT_VOIDED) so
 * historical 20-0s can be told apart from mod-entered ones going forward.
 */

import { prisma } from '#lib/server/db.js';
import { ForfeitType, MatchStatus } from '#prisma/client.js';
import { badRequest, conflict, notFound } from '#lib/server/utils/errors.js';
import { logAudit, AuditAction, AuditCategory } from '#lib/server/services/auditLog.js';
import { advancePlayoffFromMatch } from '#lib/server/services/playoffSlots.js';
import { notifyNewPlayoffMatches } from '#lib/server/services/notifications.js';

export const FORFEIT_SCORELINE = { winnerScore: 20, loserScore: 0 } as const;

export interface ForfeitOptions {
  ticketRef?: string | null;
  approvedBy: string;
  ipAddress?: string;
  /** Private reason (participants + staff only): human reason + evidence
   * (LLM judgement + ticket channel link). */
  reason?: string | null;
}

/**
 * Historical triage helper: 20-0 PLAYED matches with no forfeit flag and no
 * mod/admin score override in the audit log. These are the "unaccounted for"
 * sweeps that need a human (or a ticket transcript) to classify.
 *
 * @lintignore consumed by the external ffw backfill review flow, not a route (yet)
 */
export async function findUnaccountedSweeps(limit = 200) {
  const sweeps = await prisma.match.findMany({
    where: {
      status: MatchStatus.PLAYED,
      winnerScore: FORFEIT_SCORELINE.winnerScore,
      loserScore: FORFEIT_SCORELINE.loserScore,
      forfeitType: ForfeitType.NONE,
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      winnerId: true,
      submittedBy: true,
      submittedAt: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' },
    take: limit,
  });

  if (sweeps.length === 0) return [];

  // Matches a mod/admin touched via score override — those are admin-entered,
  // not player-submitted, and need ticket evidence to confirm as legit FFs.
  const overridden = await prisma.auditLog.findMany({
    where: {
      category: AuditCategory.MATCH,
      action: AuditAction.MATCH_SCORES_OVERRIDDEN,
      targetType: 'Match',
      targetId: { in: sweeps.map((s) => String(s.id)) },
    },
    select: { targetId: true, actorId: true, actorRole: true, timestamp: true },
  });
  const overriddenById = new Map(overridden.map((o) => [o.targetId, o]));

  return sweeps.map((s) => ({
    ...s,
    modOverridden: overriddenById.get(String(s.id)) ?? null,
  }));
}

/**
 * Reverse a PLAYED result's standings effects (W/L, games, points) and clear
 * game scores — the same accounting resetMatchToUnplayed performs, minus the
 * status flip (callers set their own outcome). Refuses when the result already
 * advanced a playoff bracket, for the same reason.
 */
async function reversePlayedResult(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  match: { id: number; homeTeamId: number; awayTeamId: number; winnerId: number | null },
) {
  const full = await tx.match.findUnique({
    where: { id: match.id },
    include: { games: true, playoffSlot: true },
  });
  if (!full) notFound('Match not found');

  if (full.playoffSlot) {
    const source = full.playoffSlot;
    const nextSlotIds = [source.winnerNextSlotId, source.loserNextSlotId].filter(
      (id): id is number => id != null,
    );
    if (nextSlotIds.length > 0) {
      const advanced = await tx.playoffSlot.findFirst({
        where: { id: { in: nextSlotIds }, matchId: { not: null } },
        select: { id: true },
      });
      if (advanced) {
        conflict(
          'This playoff result has already advanced to a later bracket match. Reset that match first.',
        );
      }
    }
  }

  if (full.winnerId) {
    const homeWins = full.games.filter(
      (g) =>
        g.homeTeamScore != null && g.awayTeamScore != null && g.homeTeamScore > g.awayTeamScore,
    ).length;
    const awayWins = full.games.filter(
      (g) =>
        g.homeTeamScore != null && g.awayTeamScore != null && g.awayTeamScore > g.homeTeamScore,
    ).length;
    const homePoints = full.games.reduce((sum, g) => sum + (g.homeTeamScore || 0), 0);
    const awayPoints = full.games.reduce((sum, g) => sum + (g.awayTeamScore || 0), 0);

    await tx.team.update({
      where: { id: full.homeTeamId },
      data: {
        wins: { decrement: full.winnerId === full.homeTeamId ? 1 : 0 },
        losses: { decrement: full.winnerId === full.awayTeamId ? 1 : 0 },
        gamesWon: { decrement: homeWins },
        gamesLost: { decrement: awayWins },
        pointsScored: { decrement: homePoints },
        pointsScoredAgainst: { decrement: awayPoints },
      },
    });

    await tx.team.update({
      where: { id: full.awayTeamId },
      data: {
        wins: { decrement: full.winnerId === full.awayTeamId ? 1 : 0 },
        losses: { decrement: full.winnerId === full.homeTeamId ? 1 : 0 },
        gamesWon: { decrement: awayWins },
        gamesLost: { decrement: homeWins },
        pointsScored: { decrement: awayPoints },
        pointsScoredAgainst: { decrement: homePoints },
      },
    });
  }

  await tx.game.updateMany({
    where: { matchId: full.id },
    data: { homeTeamScore: null, awayTeamScore: null },
  });
}

/**
 * Approve a single-team forfeit. Works on UNPLAYED, DISPUTE, and PLAYED
 * matches (an existing played result is reversed first, so old 20-0s can be
 * reclassified without a manual reset round-trip).
 */
export async function approveSingleForfeit(
  matchId: number,
  winnerTeamId: number,
  opts: ForfeitOptions,
) {
  let previousStatus = 'UNKNOWN';
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) notFound('Match not found');
    if (match.forfeitType !== ForfeitType.NONE) {
      badRequest('Match already has a forfeit recorded');
    }
    previousStatus = match.status;
    if (match.status === MatchStatus.PLAYED) {
      // Reclassifying an old result: reverse its standings effects first so the
      // forfeit W/L replaces (not stacks on) the previous outcome.
      await reversePlayedResult(tx, match);
    } else if (match.status !== MatchStatus.UNPLAYED && match.status !== MatchStatus.DISPUTE) {
      badRequest('Only unplayed, disputed, or played matches can be marked as forfeit');
    }
    if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
      badRequest('Forfeit winner must be one of the match teams');
    }

    const loserTeamId = winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    // W/L only — deliberately no gamesWon/gamesLost/points changes so point
    // averages ignore forfeits. Game rows stay scoreless (null).
    await tx.team.update({
      where: { id: winnerTeamId },
      data: { wins: { increment: 1 } },
    });
    await tx.team.update({
      where: { id: loserTeamId },
      data: { losses: { increment: 1 } },
    });

    return await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.PLAYED,
        winnerId: winnerTeamId,
        winnerScore: FORFEIT_SCORELINE.winnerScore,
        loserScore: FORFEIT_SCORELINE.loserScore,
        submittedBy: opts.approvedBy,
        submittedAt: new Date(),
        forfeitType: ForfeitType.SINGLE,
        forfeitWinnerId: winnerTeamId,
        forfeitTicketRef: opts.ticketRef ?? null,
        forfeitApprovedBy: opts.approvedBy,
        forfeitApprovedAt: new Date(),
        forfeitReason: opts.reason ?? null,
      },
    });
  });

  // Outside the transaction: playoff bracket advancement + notifications,
  // mirroring submitMatchScores. Void (mutual) forfeits have no winner, so
  // nothing advances — the bracket slot stays empty by design.
  const createdMatches = await prisma.$transaction(async (tx) =>
    advancePlayoffFromMatch(tx, matchId),
  );
  await notifyNewPlayoffMatches(createdMatches);

  logAudit({
    actorId: opts.approvedBy,
    category: AuditCategory.MATCH,
    action: AuditAction.MATCH_FORFEIT_APPROVED,
    targetType: 'Match',
    targetId: String(matchId),
    metadata: {
      winnerTeamId,
      ticketRef: opts.ticketRef ?? null,
      scoreline: '20-0',
      previousStatus,
      hasReason: !!opts.reason,
    },
    ipAddress: opts.ipAddress,
  });

  return result;
}

/**
 * Record a mutual forfeit (both teams agree not to play) as void/no-contest.
 * No standings changes at all. Works on UNPLAYED, DISPUTE, and PLAYED matches
 * (an existing played result is reversed first).
 */
export async function voidMutualForfeit(matchId: number, opts: ForfeitOptions) {
  let previousStatus = 'UNKNOWN';
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) notFound('Match not found');
    if (match.forfeitType !== ForfeitType.NONE) {
      badRequest('Match already has a forfeit recorded');
    }
    previousStatus = match.status;
    if (match.status === MatchStatus.PLAYED) {
      await reversePlayedResult(tx, match);
    } else if (match.status !== MatchStatus.UNPLAYED && match.status !== MatchStatus.DISPUTE) {
      badRequest('Only unplayed, disputed, or played matches can be voided');
    }

    return await tx.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.PLAYED,
        winnerId: null,
        winnerScore: 0,
        loserScore: 0,
        submittedBy: opts.approvedBy,
        submittedAt: new Date(),
        forfeitType: ForfeitType.MUTUAL,
        forfeitWinnerId: null,
        forfeitTicketRef: opts.ticketRef ?? null,
        forfeitApprovedBy: opts.approvedBy,
        forfeitApprovedAt: new Date(),
        forfeitReason: opts.reason ?? null,
      },
    });
  });

  logAudit({
    actorId: opts.approvedBy,
    category: AuditCategory.MATCH,
    action: AuditAction.MATCH_FORFEIT_VOIDED,
    targetType: 'Match',
    targetId: String(matchId),
    metadata: {
      ticketRef: opts.ticketRef ?? null,
      previousStatus,
      hasReason: !!opts.reason,
    },
    ipAddress: opts.ipAddress,
  });

  return result;
}
