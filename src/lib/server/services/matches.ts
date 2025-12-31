/**
 * Match Management Service
 * Core business logic for 2v2 league matches
 */

import { prisma } from '$lib/server/db';
import type { Match, Game, Team } from '$prisma/client.js';
import { MatchStatus } from '$prisma/client.js';
import { UserRole, type SessionUser } from '$lib/types/user';
import { error } from '@sveltejs/kit';
import { calculateWeekLabel } from '$lib/server/utils/matchHelpers';

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
					players: {
						where: { active: 1 },
						include: {
							player: true
						}
					}
				}
			},
			awayTeam: {
				include: {
					division: true,
					region: true,
					players: {
						where: { active: 1 },
						include: {
							player: true
						}
					}
				}
			},
			season: {
				include: {
					region: true
				}
			},
			playoff: true,
			games: {
				include: {
					arena: true
				},
				orderBy: { gameNum: 'asc' }
			},
		matchComms: {
			include: {
				user: true
			},
			orderBy: { createdAt: 'desc' }
		},
			matchMapBans: {
				include: {
					pool: {
						include: {
							mapsInPool: {
								include: {
									arena: true
								},
								orderBy: { orderNum: 'asc' }
							}
						}
					},
					actions: {
						include: {
							team: true,
							player: true,
							arena: true
						},
						orderBy: { actionOrder: 'asc' }
					}
				}
			},
			demos: {
				include: {
					player: true,
					submitter: true
				},
				orderBy: { submittedAt: 'desc' }
			},
			submitter: true
		}
	});

	if (!match) {
		throw error(404, 'Match not found');
	}

	return match;
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
			OR: [
				{ homeTeamId: match.homeTeamId },
				{ awayTeamId: match.homeTeamId }
			]
		},
		select: { id: true },
		orderBy: { id: 'asc' }
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

/**
 * Check if user can manage match (submit scores, dispute, etc.)
 * Team owners (permission=2) or admins/mods can manage
 */
export function canUserManageMatch(
	user: SessionUser | null,
	match: Match & { homeTeam: { players: Array<{ playerSteamId: string; permissionLevel: number; active: number }> }; awayTeam: { players: Array<{ playerSteamId: string; permissionLevel: number; active: number }> } }
): { canManage: boolean; isHomeOwner: boolean; isAwayOwner: boolean; isAdmin: boolean } {
	if (!user) {
		return { canManage: false, isHomeOwner: false, isAwayOwner: false, isAdmin: false };
	}

	const isAdmin =
		user.permissionLevel === UserRole.ADMIN || user.permissionLevel === UserRole.MODERATOR;

	const homeOwners = match.homeTeam.players
		.filter((p) => p.permissionLevel === 2 && p.active === 1)
		.map((p) => p.playerSteamId);

	const awayOwners = match.awayTeam.players
		.filter((p) => p.permissionLevel === 2 && p.active === 1)
		.map((p) => p.playerSteamId);

	const isHomeOwner = homeOwners.includes(user.steamId);
	const isAwayOwner = awayOwners.includes(user.steamId);

	const canManage = isAdmin || isHomeOwner || isAwayOwner;

	return { canManage, isHomeOwner, isAwayOwner, isAdmin };
}

/**
 * Validate score submission
 * Ensures scores are valid integers and match exists
 */
export function validateScoreSubmission(
	scores: Record<string, number>,
	boSeries: number
): { valid: boolean; error?: string } {
	for (const [key, value] of Object.entries(scores)) {
		if (!Number.isInteger(value) || value < 0) {
			return { valid: false, error: 'Invalid score value' };
		}
	}

	return { valid: true };
}

interface GameResult {
	gameNum: number;
	homeScore: number;
	awayScore: number;
	arenaId?: number;
}

/**
 * Calculate match winner from game results
 * Returns winner team ID, scores, and points
 */
export function calculateMatchWinner(
	homeTeamId: number,
	awayTeamId: number,
	gameResults: GameResult[]
): {
	winnerId: number | null;
	winnerScore: number;
	loserScore: number;
	homePointsScored: number;
	awayPointsScored: number;
} {
	let homeWins = 0;
	let awayWins = 0;
	let homePointsScored = 0;
	let awayPointsScored = 0;

	for (const game of gameResults) {
		if (game.homeScore > game.awayScore) {
			homeWins++;
		} else if (game.awayScore > game.homeScore) {
			awayWins++;
		}

		homePointsScored += game.homeScore;
		awayPointsScored += game.awayScore;
	}

	let winnerId: number | null = null;
	let winnerScore = 0;
	let loserScore = 0;

	if (homeWins > awayWins) {
		winnerId = homeTeamId;
		winnerScore = homeWins;
		loserScore = awayWins;
	} else if (awayWins > homeWins) {
		winnerId = awayTeamId;
		winnerScore = awayWins;
		loserScore = homeWins;
	}

	return {
		winnerId,
		winnerScore,
		loserScore,
		homePointsScored,
		awayPointsScored
	};
}

/**
 * Update team statistics after match completion
 */
export async function updateTeamStats(
	teamId: number,
	stats: {
		wins?: number;
		losses?: number;
		gamesWon: number;
		gamesLost: number;
		pointsScored: number;
		pointsScoredAgainst: number;
	}
) {
	const updateData: any = {
		gamesWon: { increment: stats.gamesWon },
		gamesLost: { increment: stats.gamesLost },
		pointsScored: { increment: stats.pointsScored },
		pointsScoredAgainst: { increment: stats.pointsScoredAgainst }
	};

	if (stats.wins !== undefined) {
		updateData.wins = { increment: stats.wins };
	}

	if (stats.losses !== undefined) {
		updateData.losses = { increment: stats.losses };
	}

	await prisma.team.update({
		where: { id: teamId },
		data: updateData
	});
}

/**
 * Reverse team statistics (for admin score edits)
 * Subtracts previously recorded stats before applying new ones
 */
export async function reverseTeamStats(
	teamId: number,
	stats: {
		wins?: number;
		losses?: number;
		gamesWon: number;
		gamesLost: number;
		pointsScored: number;
		pointsScoredAgainst: number;
	}
) {
	const updateData: any = {
		gamesWon: { decrement: stats.gamesWon },
		gamesLost: { decrement: stats.gamesLost },
		pointsScored: { decrement: stats.pointsScored },
		pointsScoredAgainst: { decrement: stats.pointsScoredAgainst }
	};

	if (stats.wins !== undefined) {
		updateData.wins = { decrement: stats.wins };
	}

	if (stats.losses !== undefined) {
		updateData.losses = { decrement: stats.losses };
	}

	await prisma.team.update({
		where: { id: teamId },
		data: updateData
	});
}

/**
 * Submit match scores and update all related data
 */
export async function submitMatchScores(
	matchId: number,
	gameResults: GameResult[],
	submittedBy: string
) {
	const match = await prisma.match.findUnique({
		where: { id: matchId },
		include: {
			homeTeam: true,
			awayTeam: true,
			games: true
		}
	});

	if (!match) {
		throw error(404, 'Match not found');
	}

	const { winnerId, winnerScore, loserScore, homePointsScored, awayPointsScored } =
		calculateMatchWinner(match.homeTeamId, match.awayTeamId, gameResults);

	// Update games with scores
	for (const result of gameResults) {
		await prisma.game.updateMany({
			where: {
				matchId: matchId,
				gameNum: result.gameNum
			},
			data: {
				homeTeamScore: result.homeScore,
				awayTeamScore: result.awayScore,
				arenaId: result.arenaId || null
			}
		});
	}

	// Update home team stats
	await updateTeamStats(match.homeTeamId, {
		wins: winnerId === match.homeTeamId ? 1 : 0,
		losses: winnerId === match.awayTeamId ? 1 : 0,
		gamesWon: gameResults.filter((g) => g.homeScore > g.awayScore).length,
		gamesLost: gameResults.filter((g) => g.awayScore > g.homeScore).length,
		pointsScored: homePointsScored,
		pointsScoredAgainst: awayPointsScored
	});

	// Update away team stats
	await updateTeamStats(match.awayTeamId, {
		wins: winnerId === match.awayTeamId ? 1 : 0,
		losses: winnerId === match.homeTeamId ? 1 : 0,
		gamesWon: gameResults.filter((g) => g.awayScore > g.homeScore).length,
		gamesLost: gameResults.filter((g) => g.homeScore > g.awayScore).length,
		pointsScored: awayPointsScored,
		pointsScoredAgainst: homePointsScored
	});

	// Update match status
	await prisma.match.update({
		where: { id: matchId },
		data: {
			winnerId,
			winnerScore,
			loserScore,
			status: MatchStatus.PLAYED,
			submittedBy,
			submittedAt: new Date()
		}
	});

	// Cancel any pending reschedule requests
	await prisma.matchComm.updateMany({
		where: {
			matchId: matchId,
			rescheduleStatus: 0
		},
		data: {
			rescheduleStatus: 3 // Canceled
		}
	});

	// TODO: Create notification for opposing team about score submission (F19)
	// TODO: If reschedule was canceled, notify requesting team (F19)

	return { winnerId, winnerScore, loserScore };
}

/**
 * File a match dispute
 * Must be within 24 hours of submission
 */
export async function disputeMatch(matchId: number, reason: string, disputedBy: string) {
	const match = await prisma.match.findUnique({
		where: { id: matchId }
	});

	if (!match) {
		throw error(404, 'Match not found');
	}

	if (match.status !== MatchStatus.PLAYED) {
		throw error(400, 'Can only dispute played matches');
	}

	if (!match.submittedAt) {
		throw error(400, 'No submission timestamp found');
	}

	const now = Date.now();
	const submittedTime = match.submittedAt.getTime();
	const hoursSinceSubmission = (now - submittedTime) / (1000 * 3600);

	if (hoursSinceSubmission > 24) {
		throw error(400, 'Dispute period has passed (24 hours)');
	}

	// Update match status to DISPUTE
	await prisma.match.update({
		where: { id: matchId },
		data: {
			status: MatchStatus.DISPUTE
		}
	});

	// Create dispute message
	await prisma.matchComm.create({
		data: {
			matchId,
			owner: disputedBy,
			content: `MATCH DISPUTED: ${reason}`,
			createdAt: Math.floor(Date.now() / 1000)
		}
	});

	// TODO: Notify admins and opposing team of dispute (F19)
}

