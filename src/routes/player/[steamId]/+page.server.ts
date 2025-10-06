import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load = async ({ params }: { params: { steamId: string } }) => {
	const { steamId } = params;

	try {
		// Fetch user basic info with Discord
		const user = await prisma.user.findUnique({
			where: { steamId },
			include: {
				discord: true
			}
		});

		if (!user) {
			throw error(404, 'Player not found');
		}

		// Fetch current and past teams with all details
		const playerTeams = await prisma.playerInTeam.findMany({
			where: { playerSteamId: steamId },
			include: {
				team: {
					include: {
						division: true,
						region: true,
						season: true
					}
				}
			},
			orderBy: {
				startedAt: 'desc'
			}
		});

		// Separate current teams (active = 1) from team history (active = 0)
		const currentTeams = playerTeams
			.filter((pt) => pt.active === 1)
			.map((pt) => ({
				teamId: pt.team.id,
				teamName: pt.team.name,
				division: pt.team.division?.name || 'N/A',
				regionName: pt.team.region?.name || 'N/A',
				seasonNum: pt.team.season?.seasonNum || 0,
				wins: pt.team.wins,
				losses: pt.team.losses,
				totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
				joined: pt.startedAt,
				permissionLevel: pt.permissionLevel
			}));

		const teamHistory = playerTeams
			.filter((pt) => pt.active === 0)
			.map((pt) => ({
				teamId: pt.team.id,
				teamName: pt.team.name,
				division: pt.team.division?.name || 'N/A',
				regionName: pt.team.region?.name || 'N/A',
				seasonNum: pt.team.season?.seasonNum || 0,
				wins: pt.team.wins,
				losses: pt.team.losses,
				totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
				joined: pt.startedAt,
				left: pt.leftAt !== '0' ? new Date(parseInt(pt.leftAt)) : null
			}));

		// Fetch tournament placements (1st, 2nd, 3rd place finishes)
		const tournaments = await prisma.tournament.findMany({
			where: {
				OR: [
					{ winner1SteamId: steamId },
					{ winner2SteamId: steamId },
					{ secondPlace1SteamId: steamId },
					{ secondPlace2SteamId: steamId },
					{ thirdPlace1SteamId: steamId },
					{ thirdPlace2SteamId: steamId }
				]
			},
			orderBy: {
				startedAt: 'desc'
			}
		});

		// Transform tournaments into placement results
		const tournamentResults = tournaments.map((tournament) => {
			let placement = 'Participant';
			if (
				tournament.winner1SteamId === steamId ||
				tournament.winner2SteamId === steamId
			) {
				placement = '1st Place';
			} else if (
				tournament.secondPlace1SteamId === steamId ||
				tournament.secondPlace2SteamId === steamId
			) {
				placement = '2nd Place';
			} else if (
				tournament.thirdPlace1SteamId === steamId ||
				tournament.thirdPlace2SteamId === steamId
			) {
				placement = '3rd Place';
			}

			return {
				id: tournament.id,
				name: tournament.name,
				date: tournament.startedAt,
				placement
			};
		});

		// Fetch Fight Night matchups
		const fightNightMatchups = await prisma.fightNightMatchup.findMany({
			where: {
				OR: [{ player1SteamId: steamId }, { player2SteamId: steamId }]
			},
			include: {
				fightNight: true,
				player1: true,
				player2: true
			},
			orderBy: {
				id: 'desc'
			}
		});

		// Transform Fight Night data
		const fightNights = fightNightMatchups.map((matchup) => {
			const isPlayer1 = matchup.player1SteamId === steamId;
			const opponent = isPlayer1 ? matchup.player2 : matchup.player1;
			const result = matchup.winnerId === steamId ? 'W' : matchup.winnerId ? 'L' : 'TBD';

			return {
				id: matchup.id,
				fightNightName: matchup.fightNight?.card || `Fight Night #${matchup.fightNightId}`,
				opponent: opponent?.steamUsername || 'Unknown',
				result,
				score: matchup.winnerScore && matchup.loserScore
					? `${matchup.winnerScore} - ${matchup.loserScore}`
					: 'TBD',
				date: matchup.fightNight?.startedAt || null
			};
		});

		// Build achievements from tournament podium finishes
		const achievements = tournamentResults
			.filter((t) => t.placement !== 'Participant')
			.map((t) => ({
				placement: t.placement,
				event: t.name,
				date: t.date
			}));

		// Return all data
		return {
			player: {
				steamId: user.steamId,
				name: user.steamUsername,
				avatar: user.steamAvatar,
				discordLinked: !!user.discord,
				permissionLevel: user.permissionLevel,
				memberSince: user.discord?.playerSteamId ? new Date() : new Date() // TODO: Track user creation date
			},
			currentTeams,
			teamHistory,
			tournaments: tournamentResults,
			fightNights,
			achievements
		};
	} catch (err) {
		console.error('Error loading player profile:', err);
		throw error(500, 'Failed to load player profile');
	}
};
