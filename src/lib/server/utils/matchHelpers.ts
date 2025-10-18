/**
 * Match Helper Utilities
 * Utility functions for match management
 */

import type { Match } from '@prisma/client';

/**
 * Calculate week label with suffix for multi-match weeks (e.g., "1a", "1b")
 * @param match - The current match
 * @param siblingsInWeek - All matches in the same week (MUST be filtered by division/region already)
 * @returns Week label with suffix if multiple matches, null if no week
 */
export function calculateWeekLabel(
	match: Match,
	siblingsInWeek: { id: number }[]
): string | null {
	if (match.weekNo === null || match.weekNo === undefined) {
		return null;
	}

	// If only 1 match in the week, no suffix needed
	if (siblingsInWeek.length <= 1) {
		return match.weekNo.toString();
	}

	const idx = siblingsInWeek.findIndex((m) => m.id === match.id);
	if (idx < 0) {
		// Match not found in siblings (shouldn't happen), just return week number
		return match.weekNo.toString();
	}

	// Multiple matches in week - add letter suffix (a, b, c...)
	const suffixChar = String.fromCharCode('a'.charCodeAt(0) + idx);
	return `${match.weekNo}${suffixChar}`;
}

/**
 * Format match date/time for display
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatMatchDateTime(date: Date | string | null): string {
	if (!date) return 'TBD';

	const d = typeof date === 'string' ? new Date(date) : date;
	
	if (isNaN(d.getTime())) return 'Invalid Date';

	return d.toLocaleDateString('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZoneName: 'short'
	});
}

/**
 * Calculate time remaining in a time window
 * @param startTimestamp - Unix timestamp (seconds) when period started
 * @param hoursAllowed - Number of hours allowed
 * @returns Time remaining as "HH:MM:SS" or "00:00:00" if expired
 */
export function calculateTimeRemaining(startTimestamp: number, hoursAllowed: number): string {
	const now = Math.floor(Date.now() / 1000);
	const deadline = startTimestamp + hoursAllowed * 60 * 60;
	const secondsRemaining = deadline - now;

	if (secondsRemaining <= 0) {
		return '00:00:00';
	}

	const hours = Math.floor(secondsRemaining / 3600);
	const minutes = Math.floor((secondsRemaining % 3600) / 60);
	const seconds = secondsRemaining % 60;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get human-readable match status
 * @param status - Match status enum value
 * @returns Status label
 */
export function getMatchStatusLabel(status: number): string {
	switch (status) {
		case 0:
			return 'Unplayed';
		case 1:
			return 'Played';
		case 2:
			return 'Disputed';
		default:
			return 'Unknown';
	}
}

/**
 * Check if a match can be disputed
 * Must be within 24 hours of submission and status must be PLAYED
 * @param match - Match to check
 * @returns True if dispute is allowed
 */
export function canDisputeMatch(match: Match): boolean {
	if (match.status !== 1) return false; // Must be PLAYED
	if (!match.submittedAt) return false;

	const now = Math.floor(Date.now() / 1000);
	const hoursSinceSubmission = (now - match.submittedAt) / 3600;

	return hoursSinceSubmission < 24;
}

/**
 * Check if a match can be rescheduled
 * Must be UNPLAYED status
 * @param match - Match to check
 * @returns True if reschedule is allowed
 */
export function canRescheduleMatch(match: Match): boolean {
	return match.status === 0; // UNPLAYED
}

/**
 * Calculate win/loss ratio
 * @param wins - Number of wins
 * @param losses - Number of losses
 * @returns Win/loss ratio
 */
export function calculateWinLossRatio(wins: number, losses: number): number {
	if (losses === 0) return wins;
	return wins / (wins + losses);
}

/**
 * Calculate points per game
 * @param pointsScored - Total points scored
 * @param gamesWon - Games won
 * @param gamesLost - Games lost
 * @returns Points per game average
 */
export function calculatePointsPerGame(
	pointsScored: number,
	gamesWon: number,
	gamesLost: number
): number {
	const totalGames = gamesWon + gamesLost;
	if (totalGames === 0) return 0;
	return pointsScored / totalGames;
}

/**
 * Format time remaining for display with automatic refresh hint
 * @param timestamp - Start timestamp
 * @param hours - Hours allowed
 * @returns Object with formatted time and expiry status
 */
export function getTimeRemainingInfo(
	timestamp: number | null,
	hours: number
): { formatted: string; expired: boolean; active: boolean } {
	if (!timestamp) {
		return { formatted: 'N/A', expired: false, active: false };
	}

	const remaining = calculateTimeRemaining(timestamp, hours);
	const expired = remaining === '00:00:00';

	return {
		formatted: remaining,
		expired,
		active: !expired
	};
}

