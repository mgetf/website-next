import { getCurrentSeason } from '$lib/server/services/seasons';
import { getTeamsForStandings, calculateStandingsStats } from '$lib/server/services/teams';
import { getLatestTournament } from '$lib/server/services/tournaments';
import { getLatestChampionship } from '$lib/server/services/championships';
import { TeamStatus } from '@prisma/client';
import { findDivisionByName } from '$lib/server/services/divisions';

export const load = async () => {
	try {
		// Fetch all data in parallel using services
		const [season, premierDivision, tournament, championship] = await Promise.all([
			getCurrentSeason(),
			findDivisionByName('Premier'),
			getLatestTournament(),
			getLatestChampionship()
		]);

		// Get top 3 premier division teams for current season
		let topTeams: any[] = [];
		if (season && premierDivision) {
			const teams = await getTeamsForStandings({
				seasonId: season.id,
				divisionId: premierDivision.id,
				statuses: [TeamStatus.READY],
				limit: 3
			});

			topTeams = teams.map((team, index) => {
				const stats = calculateStandingsStats(team);
				return {
					rank: index + 1,
					name: team.name,
					record: stats.record,
					points: stats.pointsPerGame,
					id: team.id
				};
			});
		}

		// Transform data for the homepage
		return {
			leagueData: {
				season: season ? `Season ${season.seasonNum}` : 'Season 1',
				topTeams
			},
			tournamentData: {
				next: 'TBD', // TODO: Add upcoming tournament endpoint
				lastWinner: tournament?.winner?.steamUsername || 'TBD',
				lastWinnerDate: tournament?.winnerDate || 'TBD',
				prize: tournament?.prizePool || '$250'
			},
			championshipData: {
				winner2024: championship?.winner?.steamUsername || 'TBD',
				nextDate: championship?.nextDate || 'TBD 2025'
			}
		};
	} catch (error) {
		console.error('Error loading homepage:', error);

		// Return fallback data if services fail
		return {
			leagueData: {
				season: 'Season 1',
				topTeams: []
			},
			tournamentData: {
				next: 'TBD',
				lastWinner: 'TBD',
				lastWinnerDate: 'TBD',
				prize: '$250'
			},
			championshipData: {
				winner2024: 'TBD',
				nextDate: 'TBD 2025'
			}
		};
	}
};
