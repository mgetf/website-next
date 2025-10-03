import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	try {
		const currentSeason = await prisma.season.findFirst({
			orderBy: { seasonNum: 'desc' },
			include: {
				region: true
			}
		});

		if (!currentSeason) {
			return json({ 
				id: 0, 
				seasonNum: 1, 
				regionId: 1, 
				numWeeks: 8,
				region: { id: 1, name: 'NA', hidden: 0 }
			});
		}

		return json(currentSeason);
	} catch (error) {
		console.error('Error fetching current season:', error);
		return json({ 
			id: 0, 
			seasonNum: 1, 
			regionId: 1, 
			numWeeks: 8,
			region: { id: 1, name: 'NA', hidden: 0 }
		}, { status: 500 });
	}
};

