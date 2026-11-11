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
import { badRequest, notFound } from '#lib/server/utils/errors.js';
import { logAudit, AuditAction, AuditCategory } from '#lib/server/services/auditLog.js';

export const FORFEIT_SCORELINE = { winnerScore: 20, loserScore: 0 } as const;

export interface ForfeitOptions {
  ticketRef?: string | null;
  approvedBy: string;
  ipAddress?: string;
  /** Private reason string (participants + staff only). */
  reason?: string | null;
  /** Evidence: LLM judgement + ticket channel link (participants + staff only). */
  evidence?: string | null;
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
 * Approve a single-team forfeit. Match must be UNPLAYED or DISPUTE.
 */
export async function approveSingleForfeit(
  matchId: number,
  winnerTeamId: number,
  opts: ForfeitOptions,
) {
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) notFound('Match not found');
    if (match.forfeitType !== ForfeitType.NONE) {
      badRequest('Match already has a forfeit recorded');
    }
    if (match.status !== MatchStatus.UNPLAYED && match.status !== MatchStatus.DISPUTE) {
      badRequest('Only unplayed or disputed matches can be marked as forfeit');
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
        forfeitEvidence: opts.evidence ?? null,
      },
    });
  });

  logAudit({
    actorId: opts.approvedBy,
    category: AuditCategory.MATCH,
    action: AuditAction.MATCH_FORFEIT_APPROVED,
    targetType: 'Match',
    targetId: String(matchId),
    metadata: { winnerTeamId, ticketRef: opts.ticketRef ?? null, scoreline: '20-0',
      hasReason: !!opts.reason, hasEvidence: !!opts.evidence },
    ipAddress: opts.ipAddress,
  });

  return result;
}

/**
 * Record a mutual forfeit (both teams agree not to play) as void/no-contest.
 * No standings changes at all. Match must be UNPLAYED or DISPUTE.
 */
export async function voidMutualForfeit(matchId: number, opts: ForfeitOptions) {
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) notFound('Match not found');
    if (match.forfeitType !== ForfeitType.NONE) {
      badRequest('Match already has a forfeit recorded');
    }
    if (match.status !== MatchStatus.UNPLAYED && match.status !== MatchStatus.DISPUTE) {
      badRequest('Only unplayed or disputed matches can be voided');
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
        forfeitEvidence: opts.evidence ?? null,
      },
    });
  });

  logAudit({
    actorId: opts.approvedBy,
    category: AuditCategory.MATCH,
    action: AuditAction.MATCH_FORFEIT_VOIDED,
    targetType: 'Match',
    targetId: String(matchId),
    metadata: { ticketRef: opts.ticketRef ?? null,
      hasReason: !!opts.reason, hasEvidence: !!opts.evidence },
    ipAddress: opts.ipAddress,
  });

  return result;
}
