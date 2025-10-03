import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	try {
		const latestChampionship = await prisma.championship.findFirst({
			orderBy: { id: 'desc' },
			select: {
				id: true,
				name: true,
				winner: true,
				status: true,
				startedAt: true,
				endedAt: true,
				avatar: true
			}
		});

		if (!latestChampionship) {
			return json({
				id: 0,
				name: 'No championships yet',
				winner: null,
				status: 0,
				startedAt: null,
				endedAt: null,
				nextDate: 'TBD 2025'
			});
		}

		// Get winner info if championship is complete
		let winner = null;
		if (latestChampionship.winner && latestChampionship.status > 0) {
			const winnerUser = await prisma.user.findUnique({
				where: { steamId: latestChampionship.winner },
				select: {
					steamId: true,
					steamUsername: true,
					steamAvatar: true
				}
			});
			winner = winnerUser;
		}

		// Determine next championship date
		let nextDate = 'TBD 2025';
		if (latestChampionship.status === 0) {
			nextDate = 'In Progress';
		} else if (latestChampionship.status === 1) {
			nextDate = 'Completed';
		}

		return json({
			id: latestChampionship.id,
			name: latestChampionship.name,
			winner,
			status: latestChampionship.status,
			startedAt: latestChampionship.startedAt,
			endedAt: latestChampionship.endedAt,
			avatar: latestChampionship.avatar,
			nextDate
		});
	} catch (error) {
		console.error('Error fetching latest championship:', error);
		return json({
			id: 0,
			name: 'Error loading championship',
			winner: null,
			status: 0,
			startedAt: null,
			endedAt: null,
			nextDate: 'TBD 2025'
		}, { status: 500 });
	}
};

