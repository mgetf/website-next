import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/permissions';
import { TeamStatus } from '@prisma/client';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals.user);

	// Parse query parameters
	const page = parseInt(url.searchParams.get('page') || '1');
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
	const search = url.searchParams.get('search') || '';
	const divisionFilter = url.searchParams.get('division');
	const regionFilter = url.searchParams.get('region');
	const statusFilter = url.searchParams.get('status');
	const seasonFilter = url.searchParams.get('season');

	// Build where clause
	const where: any = {};

	if (search) {
		where.OR = [
			{ name: { contains: search, mode: 'insensitive' } },
			{ acronym: { contains: search, mode: 'insensitive' } }
		];
	}

	if (divisionFilter && divisionFilter !== 'all') {
		where.divisionId = parseInt(divisionFilter);
	}

	if (regionFilter && regionFilter !== 'all') {
		where.regionId = parseInt(regionFilter);
	}

	if (statusFilter && statusFilter !== 'all') {
		const statusInt = parseInt(statusFilter);
		// Map integer to TeamStatus enum
		if (statusInt === 0) where.status = TeamStatus.UNREADY;
		else if (statusInt === 1) where.status = TeamStatus.PENDING;
		else if (statusInt === 2) where.status = TeamStatus.READY;
		else if (statusInt === 3) where.status = TeamStatus.DEAD;
	}

	if (seasonFilter && seasonFilter !== 'all') {
		where.seasonId = parseInt(seasonFilter);
	}

	// Get total count for pagination
	const totalTeams = await prisma.team.count({ where });

	// Fetch teams with pagination
	const teams = await prisma.team.findMany({
		where,
		include: {
			division: {
				select: {
					id: true,
					name: true
				}
			},
			region: {
				select: {
					id: true,
					name: true
				}
			},
			season: {
				select: {
					id: true,
					seasonNum: true
				}
			}
		},
		orderBy: [
			{ status: 'desc' },
			{ wins: 'desc' },
			{ losses: 'asc' }
		],
		skip: (page - 1) * pageSize,
		take: pageSize
	});

	// Fetch divisions for filter
	const divisions = await prisma.division.findMany({
		where: { hidden: 0 },
		select: { id: true, name: true },
		orderBy: { id: 'asc' }
	});

	// Fetch regions for filter
	const regions = await prisma.region.findMany({
		select: { id: true, name: true },
		orderBy: { id: 'asc' }
	});

	// Fetch seasons for filter
	const seasons = await prisma.season.findMany({
		select: { id: true, seasonNum: true },
		orderBy: { seasonNum: 'desc' },
		take: 10
	});

	return {
		teams: teams.map(team => ({
			id: team.id,
			name: team.name,
			acronym: team.acronym,
			avatar: team.avatar,
			record: `${team.wins}-${team.losses}`,
			wins: team.wins,
			losses: team.losses,
			status: team.status,
			paymentStatus: team.paymentStatus,
			division: team.division,
			region: team.region,
			season: team.season
		})),
		divisions,
		regions,
		seasons,
		pagination: {
			page,
			pageSize,
			totalTeams,
			totalPages: Math.ceil(totalTeams / pageSize)
		},
		filters: {
			search,
			division: divisionFilter || 'all',
			region: regionFilter || 'all',
			status: statusFilter || 'all',
			season: seasonFilter || 'all'
		}
	};
};
