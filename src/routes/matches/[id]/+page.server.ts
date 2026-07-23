/**
 * Match Page - Server Logic
 * Handles match viewing, score submission, disputes, reschedules, map bans, and communications
 */

import { error, fail, redirect, isRedirect, isHttpError } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { z } from 'zod';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

import { MatchStatus } from '$prisma/client.js';
import {
  getMatchDetails,
  canUserManageMatch,
  validateScoreSubmission,
  submitMatchScores,
  disputeMatch,
  getMatchWeekLabel,
} from '$lib/server/services/matches';
import {
  createMatchComm,
  createAdminActionComm,
  getPendingReschedule,
  updateRescheduleStatus,
  canRespondToReschedule,
  canRequestReschedule,
  getRescheduleTimeRemaining,
  getMatchCommById,
  formatRescheduleDateTime,
  getRescheduleDisplay,
  settleExpiredReschedules,
} from '$lib/server/services/matchComms';
import { getMapBanStatus, processBanPickAction } from '$lib/server/services/mapBans';
import { canDisputeMatch, localDatetimeToUtc } from '$lib/server/utils/matchHelpers';
import { createNotificationForMatch } from '$lib/server/services/notifications';
import { uploadDemo, reportDemo, getUserDemoReports } from '$lib/server/services/demos';
import {
  adminUpdateMatchSchedule,
  adminUpdateMatchArenas,
  adminDeleteMatch as deleteMatchRecord,
  adminUpdateScores,
} from '$lib/server/services/adminMatches';
import { getArenas } from '$lib/server/services/arenas';
import { getContent, getDefaultContent, CONTENT_KEYS } from '$lib/server/services/siteContent';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Zod schemas for form validation
const disputeSchema = z.object({
  reason: z.string().min(1, 'Dispute reason is required').max(1000, 'Reason too long'),
});

const postMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
});

const requestRescheduleSchema = z.object({
  proposedDateTime: z.string().min(1, 'Proposed date/time is required'),
  proposedTimezone: z.string().min(1, 'Proposed timezone is required').default('UTC'),
});

const respondRescheduleSchema = z.object({
  commId: z.coerce.number().int().positive('Invalid comm ID'),
  response: z.enum(['accept', 'deny', 'cancel'], {
    error: 'Invalid response',
  }),
});

const mapActionSchema = z.object({
  arenaId: z.coerce.number().int().positive('Invalid arena ID'),
  actionType: z.enum(['ban', 'pick'], {
    error: 'Invalid action type',
  }),
});

const reportDemoSchema = z.object({
  demoId: z.coerce.number().int().positive('Invalid demo ID'),
  description: z
    .string()
    .min(1, 'Report description is required')
    .max(2000, 'Description too long'),
});

const gameScoreEntrySchema = z.object({
  homeScore: z.coerce.number().int().min(0, 'Score cannot be negative'),
  awayScore: z.coerce.number().int().min(0, 'Score cannot be negative'),
  arenaId: z.coerce.number().int().positive().optional(),
});

const uploadDemoFieldsSchema = z.object({
  playerSteamId: z.string().min(1, 'Player selection is required'),
  description: z.string().optional().default(''),
});

const adminEditScheduleSchema = z.object({
  matchDateTime: z.string().optional().default(''),
  matchTimezone: z.string().optional().default(''),
});

const adminEditArenasSchema = z.object({
  gameId: z.array(z.coerce.number().int().positive()).min(1, 'At least one game is required'),
  arenaId: z.array(z.string()),
});

const adminUpdateScoresSchema = z.object({
  resolveDispute: z.coerce.boolean().optional().default(false),
  boSeries: z.coerce
    .number()
    .int()
    .refine((n) => [1, 3, 5, 7].includes(n), 'Best of must be 1, 3, 5, or 7'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
  const matchId = parseInt(params.id);
  if (isNaN(matchId)) {
    throw error(400, 'Invalid match ID');
  }

  await settleExpiredReschedules(matchId);

  const match = await getMatchDetails(matchId);
  const user = locals.user || null;

  // Calculate permissions
  const permissions = canUserManageMatch(user, match);

  // Calculate week label for multi-match weeks (using service layer)
  const weekLabel = await getMatchWeekLabel(match);

  // Get pending reschedule request
  const pendingReschedule = await getPendingReschedule(matchId);
  let rescheduleTimeRemaining: string | null = null;
  let pendingRescheduleFormatted: string | null = null;
  let hasPendingReschedule = false;

  if (pendingReschedule) {
    pendingRescheduleFormatted = getRescheduleDisplay(
      pendingReschedule,
      match.matchTimezone || 'UTC',
    );
  }

  if (pendingReschedule && user) {
    const timeInfo = getRescheduleTimeRemaining(pendingReschedule);
    rescheduleTimeRemaining = timeInfo.timeRemaining;

    // Check if this user has a pending reschedule from opponent
    hasPendingReschedule =
      pendingReschedule.owner !== user.steamId &&
      (permissions.isHomeOwner || permissions.isAwayOwner);
  }

  // Get map ban status
  const mapBanStatus = await getMapBanStatus(matchId);

  // Calculate dispute window remaining
  let disputeTimeRemaining: string | null = null;
  if (match.submittedAt && match.status === MatchStatus.PLAYED) {
    const now = Date.now();
    const submittedTime = match.submittedAt.getTime();
    const deadline = submittedTime + 24 * 60 * 60 * 1000; // 24 hours in ms
    const msRemaining = deadline - now;

    if (msRemaining > 0) {
      const secondsRemaining = Math.floor(msRemaining / 1000);
      const hours = Math.floor(secondsRemaining / 3600);
      const minutes = Math.floor((secondsRemaining % 3600) / 60);
      const seconds = secondsRemaining % 60;
      disputeTimeRemaining = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }

  // Get team rosters for demo upload player selection
  const homeRoster = match.homeTeam.players
    .filter((p) => p.player)
    .map((p) => ({
      steamId: p.player.steamId,
      username: p.player.steamUsername,
      avatar: p.player.steamAvatar,
    }));

  const awayRoster = match.awayTeam.players
    .filter((p) => p.player)
    .map((p) => ({
      steamId: p.player.steamId,
      username: p.player.steamUsername,
      avatar: p.player.steamAvatar,
    }));

  const allRoster = [...homeRoster, ...awayRoster];

  // Check if user can upload demos (team member or admin)
  const canUploadDemo = user
    ? permissions.isHomeOwner ||
      permissions.isAwayOwner ||
      permissions.isAdmin ||
      homeRoster.some((p) => p.steamId === user.steamId) ||
      awayRoster.some((p) => p.steamId === user.steamId)
    : false;

  // Get user's demo reports for all demos in this match
  let userDemoReports: Record<number, any[]> = {};
  if (user && match.demos) {
    for (const demo of match.demos) {
      const reports = await getUserDemoReports(demo.id, user.steamId);
      if (reports.length > 0) {
        userDemoReports[demo.id] = reports;
      }
    }
  }

  const [arenas, matchCreatedMessageContent] = await Promise.all([
    permissions.isAdmin ? getArenas() : Promise.resolve([]),
    getContent(CONTENT_KEYS.MATCH_CREATED_MESSAGE),
  ]);

  return {
    match,
    weekLabel,
    permissions,
    pendingReschedule,
    pendingRescheduleFormatted,
    rescheduleTimeRemaining,
    hasPendingReschedule,
    mapBanStatus,
    disputeTimeRemaining,
    canDispute: canDisputeMatch(match),
    canReschedule: canRequestReschedule(match),
    allRoster,
    canUploadDemo,
    userDemoReports,
    user,
    arenas,
    matchCreatedMessage:
      matchCreatedMessageContent ?? getDefaultContent(CONTENT_KEYS.MATCH_CREATED_MESSAGE),
  };
};

export const actions: Actions = {
  /**
   * Submit match scores
   */
  submitScores: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();
    const match = await getMatchDetails(matchId);

    // Permission check
    const permissions = canUserManageMatch(locals.user, match);
    if (!permissions.canManage) {
      return fail(403, { error: 'Unauthorized' });
    }

    // Check match status
    if (match.status === MatchStatus.PLAYED && !permissions.isAdmin) {
      return fail(400, { error: 'Match already played' });
    }

    const boSeries = match.boSeries || 3;
    // Playoff series play `boGames` games on each arena; regular matches use 1.
    const boGames = match.boGames && match.boGames > 1 ? match.boGames : 1;

    const gameResults: {
      gameNum: number;
      homeScore: number;
      awayScore: number;
      arenaId?: number;
    }[] = [];
    const parsedScores: Record<string, number> = {};

    // Reads, validates, and records a single game by its 0-based slot index.
    // Returns the parsed scores or a `fail` response to bubble up.
    const parseGame = (slotIndex: number, label: string) => {
      const homeScoreRaw = formData.get(`homeScore_${slotIndex}`)?.toString() ?? '';
      const awayScoreRaw = formData.get(`awayScore_${slotIndex}`)?.toString() ?? '';

      if (!homeScoreRaw || !awayScoreRaw) {
        return { error: fail(400, { error: `Missing scores for ${label}` }) } as const;
      }

      const arenaIdRaw = formData.get(`arenaId_${slotIndex}`)?.toString();
      const entry = gameScoreEntrySchema.safeParse({
        homeScore: homeScoreRaw,
        awayScore: awayScoreRaw,
        ...(arenaIdRaw ? { arenaId: arenaIdRaw } : {}),
      });

      if (!entry.success) {
        const msg = entry.error.issues[0]?.message ?? 'Invalid scores';
        return { error: fail(400, { error: `${label}: ${msg}` }) } as const;
      }

      const { homeScore, awayScore, arenaId } = entry.data;
      parsedScores[`homeScore_${slotIndex}`] = homeScore;
      parsedScores[`awayScore_${slotIndex}`] = awayScore;
      gameResults.push({ gameNum: slotIndex + 1, homeScore, awayScore, arenaId });
      return { homeScore, awayScore } as const;
    };

    if (boGames > 1) {
      // Playoff: best-of-`boSeries` arenas, each a best-of-`boGames` sub-series.
      const gameWinsNeeded = Math.ceil(boGames / 2);
      const arenaWinsNeeded = Math.ceil(boSeries / 2);
      let homeArenaWins = 0;
      let awayArenaWins = 0;
      let matchDecided = false;

      for (let arena = 0; arena < boSeries && !matchDecided; arena++) {
        let homeGameWins = 0;
        let awayGameWins = 0;
        let arenaDecided = false;

        for (let game = 0; game < boGames && !arenaDecided; game++) {
          const slotIndex = arena * boGames + game;
          const result = parseGame(slotIndex, `Arena ${arena + 1}, Game ${game + 1}`);
          if ('error' in result) return result.error;

          if (result.homeScore > result.awayScore) homeGameWins++;
          else if (result.awayScore > result.homeScore) awayGameWins++;

          if (homeGameWins >= gameWinsNeeded || awayGameWins >= gameWinsNeeded) {
            arenaDecided = true;
          }
        }

        if (!arenaDecided) {
          return fail(400, {
            error: `Arena ${arena + 1} is not decided. One team needs ${gameWinsNeeded} game wins.`,
          });
        }

        if (homeGameWins > awayGameWins) homeArenaWins++;
        else awayArenaWins++;

        if (homeArenaWins >= arenaWinsNeeded || awayArenaWins >= arenaWinsNeeded) {
          matchDecided = true;
        }
      }

      if (!matchDecided) {
        return fail(400, {
          error: `Match not decided. One team needs ${arenaWinsNeeded} arena wins in Best of ${boSeries}.`,
        });
      }
    } else {
      // Regular: best-of-`boSeries` individual games.
      const gamesToWin = Math.ceil(boSeries / 2);
      let homeWins = 0;
      let awayWins = 0;
      let matchDecided = false;

      for (let i = 0; i < boSeries && !matchDecided; i++) {
        const result = parseGame(i, `Game ${i + 1}`);
        if ('error' in result) return result.error;

        if (result.homeScore > result.awayScore) homeWins++;
        else if (result.awayScore > result.homeScore) awayWins++;

        if (homeWins >= gamesToWin || awayWins >= gamesToWin) {
          matchDecided = true;
        }
      }

      if (!matchDecided) {
        return fail(400, {
          error: `Match not decided. One team needs ${gamesToWin} wins in Best of ${boSeries}`,
        });
      }
    }

    // Validate scores
    const validation = validateScoreSubmission(parsedScores, boSeries);
    if (!validation.valid) {
      return fail(400, { error: validation.error });
    }

    try {
      await submitMatchScores(matchId, gameResults, locals.user.steamId);

      await createNotificationForMatch(
        matchId,
        'Match scores have been submitted',
        locals.user.steamId,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SCORES_SUBMITTED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { gameResults },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Scores submitted successfully' };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to submit scores') });
    }
  },

  /**
   * File a dispute
   */
  dispute: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, disputeSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { reason } = validation.data;

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);

    if (!permissions.canManage) {
      return fail(403, { error: 'Unauthorized' });
    }

    try {
      await disputeMatch(matchId, reason, locals.user.steamId);

      await createNotificationForMatch(matchId, 'Match has been disputed', locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_DISPUTED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { reason },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Dispute filed successfully' };
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Failed to file dispute') });
    }
  },

  /**
   * Post a message in match comms
   */
  postMessage: async ({ params, request, locals }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, postMessageSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { content } = validation.data;

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);

    if (!permissions.canManage) {
      return fail(403, { error: 'Unauthorized' });
    }

    try {
      await createMatchComm(matchId, locals.user.steamId, content);

      await createNotificationForMatch(
        matchId,
        `New comment: "${content.substring(0, 40)}${content.length > 40 ? '...' : ''}"`,
        locals.user.steamId,
      );

      return { success: true };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to post message') });
    }
  },

  /**
   * Request a reschedule
   */
  requestReschedule: async ({ params, request, locals }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, requestRescheduleSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { proposedDateTime, proposedTimezone } = validation.data;

    await settleExpiredReschedules(matchId);

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);

    if (!permissions.canManage) {
      return fail(403, { error: 'Unauthorized' });
    }

    if (!canRequestReschedule(match)) {
      return fail(400, { error: 'Cannot reschedule this match' });
    }

    // Check if there's already a pending reschedule
    const existing = await getPendingReschedule(matchId);
    if (existing) {
      return fail(400, { error: 'Reschedule request already pending' });
    }

    const timezone = proposedTimezone || 'UTC';
    let utcDateTime: string;
    let formattedDate: string;

    try {
      utcDateTime = localDatetimeToUtc(proposedDateTime, timezone).toISOString();
      formattedDate =
        formatRescheduleDateTime(utcDateTime, timezone) ?? new Date(utcDateTime).toISOString();
    } catch {
      return fail(400, { error: 'Invalid date/time or timezone value' });
    }

    try {
      await createMatchComm(matchId, locals.user.steamId, '', {
        proposedDateTime: utcDateTime,
        proposedTimezone: timezone,
      });

      await createNotificationForMatch(
        matchId,
        `Reschedule proposed for ${formattedDate}`,
        locals.user.steamId,
      );

      return { success: true, message: 'Reschedule request sent' };
    } catch (err) {
      return fail(500, {
        error: getErrorMessage(err, 'Failed to request reschedule'),
      });
    }
  },

  /**
   * Respond to reschedule request (accept/deny/cancel)
   */
  respondReschedule: async ({ params, request, locals }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, respondRescheduleSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { commId, response } = validation.data;

    await settleExpiredReschedules(matchId);

    const match = await getMatchDetails(matchId);
    const comm = await getMatchCommById(commId);

    if (!comm) {
      return fail(404, { error: 'Reschedule request not found' });
    }

    if (!canRespondToReschedule(locals.user, comm, match, response)) {
      return fail(403, { error: 'Unauthorized' });
    }

    try {
      await updateRescheduleStatus(commId, response, locals.user.steamId);

      const responseText = response === 'deny' ? 'denied' : `${response}ed`;
      await createNotificationForMatch(matchId, `Reschedule ${responseText}`, locals.user.steamId);

      return {
        success: true,
        message: `Reschedule ${responseText} successfully`,
      };
    } catch (err) {
      return fail(400, {
        error: getErrorMessage(err, 'Failed to respond to reschedule'),
      });
    }
  },

  /**
   * Perform map ban or pick action
   */
  mapAction: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, mapActionSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { arenaId, actionType } = validation.data;

    const match = await getMatchDetails(matchId);
    const mapBanStatus = await getMapBanStatus(matchId);

    if (!mapBanStatus || mapBanStatus.isComplete) {
      return fail(400, { error: 'Map ban phase not active' });
    }

    // Determine which team the user is on
    const isHomeTeam = match.homeTeam.players.some(
      (p) => p.playerSteamId === locals.user!.steamId && p.active === 1,
    );
    const isAwayTeam = match.awayTeam.players.some(
      (p) => p.playerSteamId === locals.user!.steamId && p.active === 1,
    );

    if (!isHomeTeam && !isAwayTeam) {
      return fail(403, { error: 'You are not on either team' });
    }

    const currentTurn = mapBanStatus.matchMapBan.currentTurn;
    const expectedTeamId = currentTurn === 0 ? match.homeTeamId : match.awayTeamId;
    const userTeamId = isHomeTeam ? match.homeTeamId : match.awayTeamId;

    if (userTeamId !== expectedTeamId) {
      return fail(400, { error: 'Not your turn' });
    }

    try {
      await processBanPickAction(
        mapBanStatus.matchMapBan.id,
        userTeamId,
        locals.user.steamId,
        arenaId,
        actionType,
      );

      const actionLabel = actionType === 'ban' ? 'banned' : 'picked';
      await createNotificationForMatch(matchId, `Map ${actionLabel}`, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MAP_BAN,
        action: actionType === 'ban' ? AuditAction.MAP_BANNED : AuditAction.MAP_PICKED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { arenaId, teamId: userTeamId },
        ipAddress: getClientAddress(),
      });

      return { success: true };
    } catch (err) {
      return fail(400, {
        error: getErrorMessage(err, 'Failed to process map action'),
      });
    }
  },

  /**
   * Upload demo file
   */
  uploadDemo: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!(file instanceof File) || file.size === 0) {
        return fail(400, { error: 'File is required' });
      }

      const fieldValidation = validateForm(formData, uploadDemoFieldsSchema);
      if (!fieldValidation.success) return validationError(fieldValidation.errors);

      const { playerSteamId, description } = fieldValidation.data;

      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.dem')) {
        return fail(400, {
          error: 'Invalid file type. Only .dem files are allowed.',
        });
      }

      // Validate file size (200MB max)
      const maxSize = 200 * 1024 * 1024;
      if (file.size > maxSize) {
        return fail(400, { error: 'File too large. Maximum size is 200MB.' });
      }

      const match = await getMatchDetails(matchId);
      const permissions = canUserManageMatch(locals.user, match);

      const homeRoster = match.homeTeam.players
        .filter((p) => p.player)
        .map((p) => p.player.steamId);
      const awayRoster = match.awayTeam.players
        .filter((p) => p.player)
        .map((p) => p.player.steamId);
      const allRoster = [...homeRoster, ...awayRoster];

      const canUpload =
        permissions.isAdmin ||
        homeRoster.includes(locals.user.steamId) ||
        awayRoster.includes(locals.user.steamId);

      if (!canUpload) {
        return fail(403, {
          error: 'Only team members or admins can upload demos',
        });
      }

      if (!allRoster.includes(playerSteamId)) {
        return fail(400, { error: 'Selected player is not in this match' });
      }

      const tempDir = join(tmpdir(), 'mge-demos');
      await mkdir(tempDir, { recursive: true });
      const tempPath = join(tempDir, `${Date.now()}-${file.name}`);

      const arrayBuffer = await file.arrayBuffer();
      await writeFile(tempPath, Buffer.from(arrayBuffer));

      await uploadDemo({
        file: {
          filepath: tempPath,
          originalFilename: file.name,
          size: file.size,
        },
        playerSteamId,
        submittedBy: locals.user.steamId,
        matchId,
        description: description || undefined,
      });

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.DEMO,
        action: AuditAction.DEMO_UPLOADED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { playerSteamId, filename: file.name, size: file.size },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Demo uploaded successfully' };
    } catch (err) {
      console.error(`[Demo Upload] Error for match ${matchId}:`, err);
      if (err instanceof Error) {
        console.error(`[Demo Upload] Error details:`, {
          name: err.name,
          message: err.message,
          stack: err.stack?.slice(0, 500),
        });
      }
      return fail(500, { error: getErrorMessage(err, 'Failed to upload demo') });
    }
  },

  /**
   * Report demo for suspicious activity
   */
  reportDemo: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    try {
      const formData = await request.formData();

      // Validate form data with Zod
      const validation = validateForm(formData, reportDemoSchema);
      if (!validation.success) {
        return validationError(validation.errors, 'Invalid form data');
      }

      const { demoId, description } = validation.data;

      await reportDemo(demoId, locals.user.steamId, description);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.DEMO,
        action: AuditAction.DEMO_REPORTED,
        targetType: 'Demo',
        targetId: String(demoId),
        metadata: { matchId: parseInt(params.id), description },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Demo report submitted successfully' };
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Failed to submit report') });
    }
  },

  /**
   * Admin: update match schedule and timezone
   */
  adminEditSchedule: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);
    if (!permissions.isAdmin) {
      return fail(403, { error: 'Admin access required' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, adminEditScheduleSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { matchDateTime, matchTimezone } = validation.data;
    const tz = matchTimezone || 'UTC';

    let utcIso: string | null = null;
    if (matchDateTime) {
      try {
        utcIso = localDatetimeToUtc(matchDateTime, tz).toISOString();
      } catch {
        return fail(400, { error: 'Invalid date/time value' });
      }
    }

    try {
      await adminUpdateMatchSchedule(matchId, utcIso, matchTimezone || null);

      const roleLabel = locals.user.permissionLevel === 'ADMIN' ? 'Admin' : 'Moderator';
      let scheduleNote: string;
      if (utcIso) {
        const tz = matchTimezone || 'UTC';
        const formatted = formatRescheduleDateTime(utcIso, tz);
        scheduleNote = `${roleLabel} ${locals.user.steamUsername} updated the match schedule to ${formatted ?? utcIso}.`;
      } else {
        scheduleNote = `${roleLabel} ${locals.user.steamUsername} cleared the match schedule.`;
      }
      await createAdminActionComm(matchId, locals.user.steamId, scheduleNote);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SCHEDULE_UPDATED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { matchDateTimeUtc: utcIso, matchTimezone: matchTimezone || null },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Schedule updated successfully' };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to update schedule') });
    }
  },

  /**
   * Admin: update per-game arena assignments
   */
  adminEditArenas: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);
    if (!permissions.isAdmin) {
      return fail(403, { error: 'Admin access required' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, adminEditArenasSchema, ['gameId', 'arenaId']);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { gameId: gameIds, arenaId: arenaIdStrings } = validation.data;

    if (gameIds.length !== arenaIdStrings.length) {
      return fail(400, { error: 'Game and arena lists must be the same length' });
    }

    const arenaAssignments = gameIds.map((gid, i) => ({
      gameId: gid,
      arenaId: arenaIdStrings[i] ? parseInt(arenaIdStrings[i]) : null,
    }));

    try {
      await adminUpdateMatchArenas(matchId, arenaAssignments);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_ARENAS_UPDATED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { arenaAssignments },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Arenas updated successfully' };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to update arenas') });
    }
  },

  /**
   * Admin: delete an unplayed match with no scores
   */
  adminDeleteMatch: async ({ params, locals, getClientAddress, request }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);
    if (!permissions.isAdmin) {
      return fail(403, { error: 'Admin access required' });
    }

    // Consume the form body (required even if unused for named actions)
    await request.formData();

    try {
      await deleteMatchRecord(matchId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_DELETED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: {
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          seasonId: match.seasonId,
        },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, '/admin/matches');
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, { error: getErrorMessage(err, 'Failed to delete match') });
    }
  },

  /**
   * Admin: override match scores (works on UNPLAYED, PLAYED, and DISPUTE matches)
   */
  adminUpdateScores: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    const match = await getMatchDetails(matchId);
    const permissions = canUserManageMatch(locals.user, match);
    if (!permissions.isAdmin) {
      return fail(403, { error: 'Admin access required' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, adminUpdateScoresSchema);
    if (!validation.success) return validationError(validation.errors, 'Invalid form data');
    const { resolveDispute, boSeries } = validation.data;

    // Playoff matches have `boGames` slots per arena; account for them so the
    // admin form can edit every game, not just the first arena.
    const gamesPerArena = match.boGames && match.boGames > 1 ? match.boGames : 1;
    const totalSlots = boSeries * gamesPerArena;

    const gameResults = [];

    for (let i = 0; i < totalSlots; i++) {
      const homeScoreStr = formData.get(`homeScore_${i}`)?.toString() ?? '';
      const awayScoreStr = formData.get(`awayScore_${i}`)?.toString() ?? '';

      if (!homeScoreStr && !awayScoreStr) continue;

      if (!homeScoreStr || !awayScoreStr) {
        return fail(400, { error: `Game ${i + 1}: both scores are required` });
      }

      const entry = gameScoreEntrySchema.safeParse({
        homeScore: homeScoreStr,
        awayScore: awayScoreStr,
      });

      if (!entry.success) {
        return fail(400, { error: `Game ${i + 1}: ${entry.error.issues[0]?.message}` });
      }

      gameResults.push({ gameNum: i + 1, ...entry.data });
    }

    if (gameResults.length === 0) {
      return fail(400, { error: 'No valid scores provided' });
    }

    const previousStatus = match.status;
    const previousBoSeries = match.boSeries ?? null;

    try {
      await adminUpdateScores(matchId, gameResults, { resolveDispute, boSeries });

      await createNotificationForMatch(
        matchId,
        'An admin updated the match scores',
        locals.user.steamId,
      );

      const roleLabel = locals.user.permissionLevel === 'ADMIN' ? 'Admin' : 'Moderator';
      const gamesSummary = gameResults
        .map((g) => `Game ${g.gameNum}: ${g.homeScore}–${g.awayScore}`)
        .join(', ');
      const scoresNote = `${roleLabel} ${locals.user.steamUsername} overrode the match scores: ${gamesSummary}.`;
      await createAdminActionComm(matchId, locals.user.steamId, scoresNote);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SCORES_OVERRIDDEN,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: {
          gameResults,
          resolveDispute,
          previousStatus,
          previousBoSeries,
          boSeries,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Scores updated successfully' };
    } catch (err) {
      if (isHttpError(err)) {
        return fail(err.status, { error: getErrorMessage(err, 'Failed to update scores') });
      }
      return fail(500, { error: getErrorMessage(err, 'Failed to update scores') });
    }
  },
};
