/**
 * Match Page - Server Logic
 * Handles match viewing, score submission, disputes, reschedules, map bans, and communications
 */

import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { MatchStatus } from '@prisma/client';
import {
	getMatchDetails,
	canUserManageMatch,
	validateScoreSubmission,
	submitMatchScores,
	disputeMatch,
	getMatchWeekLabel
} from '$lib/server/services/matches';
import {
	createMatchComm,
	getPendingReschedule,
	updateRescheduleStatus,
	canRespondToReschedule,
	canRequestReschedule,
	getRescheduleTimeRemaining,
	getMatchCommById
} from '$lib/server/services/matchComms';
import {
	getMapBanStatus,
	processBanPickAction,
	determineNextAction
} from '$lib/server/services/mapBans';
import { calculateWeekLabel, canDisputeMatch } from '$lib/server/utils/matchHelpers';

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
		const now = Math.floor(Date.now() / 1000);
		const deadline = match.submittedAt + 24 * 60 * 60;
		const secondsRemaining = deadline - now;

		if (secondsRemaining > 0) {
			const hours = Math.floor(secondsRemaining / 3600);
			const minutes = Math.floor((secondsRemaining % 3600) / 60);
			const seconds = secondsRemaining % 60;
			disputeTimeRemaining = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
		user
	};
};

export const actions: Actions = {
	/**
	 * Submit match scores
	 */
	submitScores: async ({ params, request, locals }) => {
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

		// Parse scores
		const gameResults = [];
		const parsedScores: Record<string, number> = {};
		
		for (let i = 0; i < (match.boSeries || 3); i++) {
			const homeScoreStr = formData.get(`homeScore_${i}`) as string;
			const awayScoreStr = formData.get(`awayScore_${i}`) as string;
			
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
				return fail(400, { error: `Scores cannot be negative for Game ${i + 1}` });
			}

			parsedScores[`homeScore_${i}`] = homeScore;
			parsedScores[`awayScore_${i}`] = awayScore;

			gameResults.push({
				gameNum: i + 1,
				homeScore,
				awayScore,
				arenaId
			});
		}

		// Validate
		const validation = validateScoreSubmission(parsedScores, match.boSeries || 3);
		if (!validation.valid) {
			return fail(400, { error: validation.error });
		}

		try {
			await submitMatchScores(matchId, gameResults, locals.user.steamId);

			// TODO: Create notification for opposing team (F19)

			return { success: true, message: 'Scores submitted successfully' };
		} catch (err: any) {
			return fail(500, { error: err.message || 'Failed to submit scores' });
		}
	},

	/**
	 * File a dispute
	 */
	dispute: async ({ params, request, locals }) => {
		requireAuth(locals.user);
		const matchId = parseInt(params.id);

		const formData = await request.formData();
		const reason = formData.get('reason') as string;

		if (!reason || reason.trim().length === 0) {
			return fail(400, { error: 'Dispute reason is required' });
		}

		const match = await getMatchDetails(matchId);
		const permissions = canUserManageMatch(locals.user, match);

		if (!permissions.canManage) {
			return fail(403, { error: 'Unauthorized' });
		}

		try {
			await disputeMatch(matchId, reason, locals.user.steamId);

			// TODO: Notify admins and opposing team of dispute (F19)

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
		const content = formData.get('content') as string;

		if (!content || content.trim().length === 0) {
			return fail(400, { error: 'Message content is required' });
		}

		const match = await getMatchDetails(matchId);
		const permissions = canUserManageMatch(locals.user, match);

		if (!permissions.canManage) {
			return fail(403, { error: 'Unauthorized' });
		}

		try {
			await createMatchComm(matchId, locals.user.steamId, content);

			// TODO: Notify team owners of new message (F19)

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
		const proposedDateTime = formData.get('proposedDateTime') as string;

		if (!proposedDateTime) {
			return fail(400, { error: 'Proposed date/time is required' });
		}

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
			
			await createMatchComm(matchId, locals.user.steamId, '', {
				proposedDateTime: utcDateTime
			});

			// TODO: Notify opposing team of reschedule request (F19)

			return { success: true, message: 'Reschedule request sent' };
		} catch (err: any) {
			return fail(500, { error: err.message || 'Failed to request reschedule' });
		}
	},

	/**
	 * Respond to reschedule request (accept/deny/cancel)
	 */
	respondReschedule: async ({ params, request, locals }) => {
		requireAuth(locals.user);
		const matchId = parseInt(params.id);

		const formData = await request.formData();
		const commId = parseInt(formData.get('commId') as string);
		const response = formData.get('response') as 'accept' | 'deny' | 'cancel';

		if (!commId || !response) {
			return fail(400, { error: 'Invalid request' });
		}

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

			// TODO: Notify relevant parties of response (F19)

			return { success: true, message: `Reschedule ${response}ed successfully` };
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to respond to reschedule' });
		}
	},

	/**
	 * Perform map ban or pick action
	 */
	mapAction: async ({ params, request, locals }) => {
		requireAuth(locals.user);
		const matchId = parseInt(params.id);

		const formData = await request.formData();
		const arenaId = parseInt(formData.get('arenaId') as string);
		const actionType = formData.get('actionType') as 'ban' | 'pick';

		if (!arenaId || !actionType) {
			return fail(400, { error: 'Invalid request' });
		}

		const match = await getMatchDetails(matchId);
		const mapBanStatus = await getMapBanStatus(matchId);

		if (!mapBanStatus || mapBanStatus.isComplete) {
			return fail(400, { error: 'Map ban phase not active' });
		}

		// Determine which team the user is on
		const isHomeTeam = match.homeTeam.players.some(
			(p) => p.playerSteamId === locals.user.steamId && p.active === 1
		);
		const isAwayTeam = match.awayTeam.players.some(
			(p) => p.playerSteamId === locals.user.steamId && p.active === 1
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
				actionType
			);

			// TODO: Notify opposing team of map action (F19)

			return { success: true };
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to process map action' });
		}
	}

	// TODO: Demo submission action will be implemented when demo service is complete (F10)
	// submitDemo: async ({ params, request, locals }) => { ... }
};

