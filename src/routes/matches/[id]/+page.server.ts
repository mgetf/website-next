/**
 * Match Page - Server Logic
 * Handles match viewing, score submission, disputes, reschedules, map bans, and communications
 */

import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { z } from 'zod';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError } from '$lib/server/utils/forms';

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
  getPendingReschedule,
  updateRescheduleStatus,
  canRespondToReschedule,
  canRequestReschedule,
  getRescheduleTimeRemaining,
  getMatchCommById,
} from '$lib/server/services/matchComms';
import { getMapBanStatus, processBanPickAction } from '$lib/server/services/mapBans';
import { canDisputeMatch } from '$lib/server/utils/matchHelpers';
import { createNotificationForMatch } from '$lib/server/services/notifications';
import { uploadDemo, reportDemo, getUserDemoReports } from '$lib/server/services/demos';
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

export const load: PageServerLoad = async ({ params, locals }) => {
  const matchId = parseInt(params.id);
  if (isNaN(matchId)) {
    throw error(400, 'Invalid match ID');
  }

  const match = await getMatchDetails(matchId);
  const user = locals.user || null;

  // Calculate permissions
  const permissions = canUserManageMatch(user, match);

  // Calculate week label for multi-match weeks (using service layer)
  const weekLabel = await getMatchWeekLabel(match);

  // Get pending reschedule request
  const pendingReschedule = await getPendingReschedule(matchId);
  let rescheduleTimeRemaining: string | null = null;
  let hasPendingReschedule = false;

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

  return {
    match,
    weekLabel,
    permissions,
    pendingReschedule,
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
    const gamesToWin = Math.ceil(boSeries / 2); // e.g., 2 for BO3, 3 for BO5

    // Parse scores - only require games until match is decided
    const gameResults = [];
    const parsedScores: Record<string, number> = {};
    let homeWins = 0;
    let awayWins = 0;
    let matchDecided = false;

    for (let i = 0; i < boSeries; i++) {
      // If match already decided, skip remaining games
      if (matchDecided) {
        break;
      }

      const homeScoreStr = formData.get(`homeScore_${i}`) as string;
      const awayScoreStr = formData.get(`awayScore_${i}`) as string;

      // Only require scores if match hasn't been decided yet
      if (!homeScoreStr || !awayScoreStr) {
        return fail(400, { error: `Missing scores for Game ${i + 1}` });
      }

      const homeScore = parseInt(homeScoreStr);
      const awayScore = parseInt(awayScoreStr);
      const arenaId = formData.get(`arenaId_${i}`)
        ? parseInt(formData.get(`arenaId_${i}`) as string)
        : undefined;

      if (isNaN(homeScore) || isNaN(awayScore)) {
        return fail(400, { error: `Invalid scores for Game ${i + 1}` });
      }

      if (homeScore < 0 || awayScore < 0) {
        return fail(400, {
          error: `Scores cannot be negative for Game ${i + 1}`,
        });
      }

      parsedScores[`homeScore_${i}`] = homeScore;
      parsedScores[`awayScore_${i}`] = awayScore;

      gameResults.push({
        gameNum: i + 1,
        homeScore,
        awayScore,
        arenaId,
      });

      // Track wins to determine if match is decided
      if (homeScore > awayScore) {
        homeWins++;
      } else if (awayScore > homeScore) {
        awayWins++;
      }

      // Check if match is now decided
      if (homeWins >= gamesToWin || awayWins >= gamesToWin) {
        matchDecided = true;
      }
    }

    // Ensure match was actually decided
    if (!matchDecided) {
      return fail(400, {
        error: `Match not decided. One team needs ${gamesToWin} wins in Best of ${boSeries}`,
      });
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
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to submit scores' });
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
    } catch (err: any) {
      return fail(400, { error: err.message || 'Failed to file dispute' });
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
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to post message' });
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

    const { proposedDateTime } = validation.data;

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

    try {
      const utcDateTime = new Date(proposedDateTime + 'Z').toISOString();
      const formattedDate = new Date(utcDateTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      await createMatchComm(matchId, locals.user.steamId, '', {
        proposedDateTime: utcDateTime,
      });

      await createNotificationForMatch(
        matchId,
        `Reschedule proposed for ${formattedDate}`,
        locals.user.steamId,
      );

      return { success: true, message: 'Reschedule request sent' };
    } catch (err: any) {
      return fail(500, {
        error: err.message || 'Failed to request reschedule',
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
    } catch (err: any) {
      return fail(400, {
        error: err.message || 'Failed to respond to reschedule',
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
    } catch (err: any) {
      return fail(400, {
        error: err.message || 'Failed to process map action',
      });
    }
  },

  /**
   * Upload demo file
   */
  uploadDemo: async ({ params, request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    const matchId = parseInt(params.id);

    console.log(
      `[Demo Upload] Starting upload for match ${matchId} by user ${locals.user.steamId}`,
    );

    try {
      console.log(`[Demo Upload] Parsing form data...`);
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const playerSteamId = formData.get('playerSteamId') as string;
      const description = formData.get('description') as string;

      console.log(
        `[Demo Upload] File: ${file?.name || 'none'}, Size: ${file?.size || 0} bytes, Player: ${playerSteamId}`,
      );

      if (!file || file.size === 0) {
        console.log(`[Demo Upload] Error: No file provided`);
        return fail(400, { error: 'File is required' });
      }

      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.dem')) {
        console.log(`[Demo Upload] Error: Invalid file type: ${file.name}`);
        return fail(400, {
          error: 'Invalid file type. Only .dem files are allowed.',
        });
      }

      // Validate file size (200MB max)
      const maxSize = 200 * 1024 * 1024;
      if (file.size > maxSize) {
        console.log(`[Demo Upload] Error: File too large: ${file.size} bytes`);
        return fail(400, { error: 'File too large. Maximum size is 200MB.' });
      }

      if (!playerSteamId) {
        return fail(400, { error: 'Player selection is required' });
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

      console.log(`[Demo Upload] Uploading to R2 storage...`);
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

      console.log(`[Demo Upload] Success! Demo uploaded for match ${matchId}`);

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
    } catch (err: any) {
      console.error(`[Demo Upload] Error for match ${matchId}:`, err);
      console.error(`[Demo Upload] Error details:`, {
        name: err.name,
        message: err.message,
        stack: err.stack?.slice(0, 500),
      });
      return fail(500, { error: err.message || 'Failed to upload demo' });
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
    } catch (err: any) {
      return fail(400, { error: err.message || 'Failed to submit report' });
    }
  },
};
