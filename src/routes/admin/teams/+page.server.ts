import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/permissions';
import { TeamStatus } from '@prisma/client';
import { fail } from '@sveltejs/kit';
import { getSeasonsForFilter } from '$lib/server/services/seasons';
import { getRegionsForFilter } from '$lib/server/services/regions';

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
	const regions = await getRegionsForFilter();

	// Fetch seasons for filter
	const seasons = await getSeasonsForFilter();

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

export const actions: Actions = {
	updateTeam: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const teamId = parseInt(formData.get('teamId') as string);
		const name = formData.get('name') as string;
		const acronym = formData.get('acronym') as string;
		const seasonId = formData.get('seasonId') as string;
		const divisionId = formData.get('divisionId') as string;
		const regionId = formData.get('regionId') as string;
		const status = formData.get('status') as string;

		// Validate inputs
		if (!teamId || teamId < 1) {
			return fail(400, { error: 'Invalid team ID' });
		}
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Team name is required' });
		}

		try {
			// Check if team exists
			const team = await prisma.team.findUnique({
				where: { id: teamId }
			});

			if (!team) {
				return fail(404, { error: 'Team not found' });
			}

			// Build update data
			const updateData: any = {
				name: name.trim(),
				acronym: acronym?.trim() || null,
				seasonId: seasonId === 'none' ? null : (seasonId ? parseInt(seasonId) : null),
				divisionId: divisionId === 'none' ? null : (divisionId ? parseInt(divisionId) : null),
				regionId: regionId === 'none' ? null : (regionId ? parseInt(regionId) : null)
			};

			// Handle status enum conversion
			if (status) {
				const statusInt = parseInt(status);
				if (statusInt === -1) updateData.status = TeamStatus.DEAD;
				else if (statusInt === 0) updateData.status = TeamStatus.UNREADY;
				else if (statusInt === 1) updateData.status = TeamStatus.PENDING;
				else if (statusInt === 2) updateData.status = TeamStatus.READY;
				else if (statusInt === 3) updateData.status = TeamStatus.PLACEMENT;
			}

			// Update the team
			await prisma.team.update({
				where: { id: teamId },
				data: updateData
			});

			return { success: true, message: 'Team updated successfully!' };
		} catch (error) {
			console.error('Error updating team:', error);
			return fail(500, { error: 'Failed to update team' });
		}
	},

	deleteTeam: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const teamId = parseInt(formData.get('teamId') as string);

		// Validate input
		if (!teamId || teamId < 1) {
			return fail(400, { error: 'Invalid team ID' });
		}

		try {
			// Check if team exists and get related data counts
			const team = await prisma.team.findUnique({
				where: { id: teamId },
				include: {
					_count: {
						select: {
							players: true,
							homeMatches: true,
							awayMatches: true
						}
					}
				}
			});

			if (!team) {
				return fail(404, { error: 'Team not found' });
			}

			// Check if team has players or matches
			const totalMatches = team._count.homeMatches + team._count.awayMatches;
			if (team._count.players > 0 || totalMatches > 0) {
				return fail(400, { 
					error: `Cannot delete team with ${team._count.players} players and ${totalMatches} matches. Remove all players and matches first.` 
				});
			}

			// Delete the team
			await prisma.team.delete({
				where: { id: teamId }
			});

			return { success: true, message: 'Team deleted successfully!' };
		} catch (error) {
			console.error('Error deleting team:', error);
			return fail(500, { error: 'Failed to delete team' });
		}
	}
};
