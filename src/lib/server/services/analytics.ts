/**
 * Analytics Service Layer
 * Provides league statistics for admin dashboard
 */

import { prisma } from '$lib/server/db';
import { MatchStatus, DemoStatus } from '@prisma/client';

interface PlayerPerDivision {
	divisionName: string;
	playerCount: number;
}

interface TeamPerRegion {
	regionName: string;
	teamCount: number;
}

interface PaymentStatus {
	paid: number;
	unpaid: number;
	freeTier: number;
	totalInPaidDivisions: number;
	paymentRate: number;
}

interface KeyMetrics {
	pendingPlayers: number;
	disputedMatches: number;
	openDemoReports: number;
}

interface AnalyticsData {
	playersPerDivision: PlayerPerDivision[];
	teamsPerRegion: TeamPerRegion[];
	paymentStatus: PaymentStatus;
	keyMetrics: KeyMetrics;
	totalPlayers: number;
	totalTeams: number;
	activeSeasonCount: number;
}

export async function getAdminAnalytics(): Promise<AnalyticsData> {
	const globalSettings = await prisma.global.findFirst();

	if (!globalSettings) {
		throw new Error('Global settings not found');
	}

	const activeSeasonIds = [
		globalSettings.naSignupSeasonId,
		globalSettings.euSignupSeasonId,
		globalSettings.ausSignupSeasonId,
		globalSettings.saSignupSeasonId,
		globalSettings.asiaSignupSeasonId
	].filter((id): id is number => id !== null);

	if (activeSeasonIds.length === 0) {
		return {
			playersPerDivision: [],
			teamsPerRegion: [],
			paymentStatus: {
				paid: 0,
				unpaid: 0,
				freeTier: 0,
				totalInPaidDivisions: 0,
				paymentRate: 0
			},
			keyMetrics: {
				pendingPlayers: 0,
				disputedMatches: 0,
				openDemoReports: 0
			},
			totalPlayers: 0,
			totalTeams: 0,
			activeSeasonCount: 0
		};
	}

	const [
		playersInActiveSeasonsRaw,
		teamsInActiveSeasonsRaw,
		paymentBreakdownRaw,
		pendingPlayersCount,
		disputedMatchesCount,
		openDemoReportsCount
	] = await Promise.all([
		prisma.$queryRaw<{ divisionName: string; playerCount: bigint }[]>`
			SELECT d.name as "divisionName", COUNT(DISTINCT pit.player_steam_id) as "playerCount"
			FROM players_in_teams pit
			INNER JOIN teams t ON pit.team_id = t.id
			INNER JOIN divisions d ON t.division_id = d.id
			WHERE pit.active = 1
			AND t.season_id = ANY(ARRAY[${activeSeasonIds}])
			GROUP BY d.name
			ORDER BY "playerCount" DESC
		`,

		prisma.$queryRaw<{ regionName: string; teamCount: bigint }[]>`
			SELECT r.name as "regionName", COUNT(t.id) as "teamCount"
			FROM teams t
			INNER JOIN regions r ON t.region_id = r.id
			WHERE t.season_id = ANY(ARRAY[${activeSeasonIds}])
			GROUP BY r.name
			ORDER BY "teamCount" DESC
		`,

		prisma.$queryRaw<{ category: string; count: bigint }[]>`
			SELECT
				CASE
					WHEN d.signup_cost > 0 AND pit.payment_status = 1 THEN 'paid'
					WHEN d.signup_cost > 0 AND pit.payment_status = 0 THEN 'unpaid'
					ELSE 'free'
				END as category,
				COUNT(*) as count
			FROM players_in_teams pit
			INNER JOIN teams t ON pit.team_id = t.id
			INNER JOIN divisions d ON t.division_id = d.id
			WHERE pit.active = 1
			AND t.season_id = ANY(ARRAY[${activeSeasonIds}])
			GROUP BY category
		`,

		prisma.playerInTeam.count({
			where: {
				active: 0,
				team: {
					seasonId: { in: activeSeasonIds }
				}
			}
		}),

		prisma.match.count({
			where: {
				status: MatchStatus.DISPUTE
			}
		}),

		prisma.demoReport.count({
			where: {
				status: DemoStatus.REVIEW
			}
		})
	]);

	const playersPerDivision: PlayerPerDivision[] = playersInActiveSeasonsRaw.map((row) => ({
		divisionName: row.divisionName,
		playerCount: Number(row.playerCount)
	}));

	const teamsPerRegion: TeamPerRegion[] = teamsInActiveSeasonsRaw.map((row) => ({
		regionName: row.regionName,
		teamCount: Number(row.teamCount)
	}));

	const paidCount = Number(
		paymentBreakdownRaw.find((p) => p.category === 'paid')?.count || 0
	);
	const unpaidCount = Number(
		paymentBreakdownRaw.find((p) => p.category === 'unpaid')?.count || 0
	);
	const freeTierCount = Number(
		paymentBreakdownRaw.find((p) => p.category === 'free')?.count || 0
	);

	const totalInPaidDivisions = paidCount + unpaidCount;
	const paymentRate =
		totalInPaidDivisions > 0 ? Math.round((paidCount / totalInPaidDivisions) * 100) : 0;

	const totalPlayers = playersPerDivision.reduce((sum, div) => sum + div.playerCount, 0);
	const totalTeams = teamsPerRegion.reduce((sum, reg) => sum + reg.teamCount, 0);

	return {
		playersPerDivision,
		teamsPerRegion,
		paymentStatus: {
			paid: paidCount,
			unpaid: unpaidCount,
			freeTier: freeTierCount,
			totalInPaidDivisions,
			paymentRate
		},
		keyMetrics: {
			pendingPlayers: pendingPlayersCount,
			disputedMatches: disputedMatchesCount,
			openDemoReports: openDemoReportsCount
		},
		totalPlayers,
		totalTeams,
		activeSeasonCount: activeSeasonIds.length
	};
}

