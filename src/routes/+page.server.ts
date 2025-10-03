export const load = async ({ fetch }) => {
	try {
		// Fetch all data in parallel from granular API endpoints
		const [seasonRes, standingsRes, tournamentRes, championshipRes] = await Promise.all([
			fetch('/api/seasons/current'),
			fetch('/api/teams/standings?limit=3&division=premier&season=current'),
			fetch('/api/tournaments/latest'),
			fetch('/api/championships/latest')
		]);

		// Parse responses
		const season = await seasonRes.json();
		const standings = await standingsRes.json();
		const tournament = await tournamentRes.json();
		const championship = await championshipRes.json();

		// Transform data for the homepage
		return {
			leagueData: {
				season: `Season ${season.seasonNum}`,
				topTeams: standings.map((team: any) => ({
					rank: team.rank,
					name: team.name,
					record: team.record,
					points: team.pointsPerGame,
					id: team.id
				}))
			},
			tournamentData: {
				next: 'TBD', // TODO: Add upcoming tournament endpoint
				lastWinner: tournament.winner?.steamUsername || 'TBD',
				lastWinnerDate: tournament.winnerDate,
				prize: tournament.prizePool
			},
			championshipData: {
				winner2024: championship.winner?.steamUsername || 'TBD',
				nextDate: championship.nextDate
			}
		};
	} catch (error) {
		console.error('Error loading homepage:', error);

		// Return fallback data if APIs fail
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
