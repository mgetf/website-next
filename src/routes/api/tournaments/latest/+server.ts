import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	try {
		const latestTournament = await prisma.tournament.findFirst({
			orderBy: { id: 'desc' },
			select: {
				id: true,
				name: true,
				description: true,
				bracketLink: true,
				avatar: true,
				startedAt: true,
				winner1SteamId: true,
				winner2SteamId: true,
				secondPlace1SteamId: true,
				secondPlace2SteamId: true,
				thirdPlace1SteamId: true,
				thirdPlace2SteamId: true,
				isTeamTournament: true
			}
		});

		if (!latestTournament) {
			return json({
				id: 0,
				name: 'No tournaments yet',
				startedAt: null,
				winner: null,
				winnerDate: 'TBD',
				prizePool: '$250'
			});
		}

		// Get winner info if exists
		let winner = null;
		let winnerDate = 'TBD';

		if (latestTournament.winner1SteamId) {
			const winnerUser = await prisma.user.findUnique({
				where: { steamId: latestTournament.winner1SteamId },
				select: {
					steamId: true,
					steamUsername: true,
					steamAvatar: true
				}
			});
			winner = winnerUser;
		}

		if (latestTournament.startedAt) {
			try {
				const date = new Date(parseInt(latestTournament.startedAt));
				winnerDate = date.toLocaleDateString('en-US', {
					month: 'long',
					year: 'numeric'
				});
			} catch {
				winnerDate = 'Recently';
			}
		}

		return json({
			id: latestTournament.id,
			name: latestTournament.name,
			description: latestTournament.description,
			bracketLink: latestTournament.bracketLink,
			avatar: latestTournament.avatar,
			startedAt: latestTournament.startedAt,
			winner,
			winnerDate,
			prizePool: '$250', // TODO: Add to database schema if needed
			isTeamTournament: latestTournament.isTeamTournament
		});
	} catch (error) {
		console.error('Error fetching latest tournament:', error);
		return json({
			id: 0,
			name: 'Error loading tournament',
			startedAt: null,
			winner: null,
			winnerDate: 'TBD',
			prizePool: '$250'
		}, { status: 500 });
	}
};

