import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { TeamStatus } from '$prisma/client.js';
import { fail } from '@sveltejs/kit';
import { getSeasonsForFilter } from '$lib/server/services/seasons';
import { getRegionsForFilter } from '$lib/server/services/regions';
import { getDivisionsForFilter } from '$lib/server/services/divisions';
import { getTeams, countTeams, updateTeam } from '$lib/server/services/teams';

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

	// Parse filters
	const divisionId = divisionFilter && divisionFilter !== 'all' ? parseInt(divisionFilter) : undefined;
	const regionId = regionFilter && regionFilter !== 'all' ? parseInt(regionFilter) : undefined;
	const seasonId = seasonFilter && seasonFilter !== 'all' ? parseInt(seasonFilter) : undefined;
	
	let status: TeamStatus | undefined;
	if (statusFilter && statusFilter !== 'all') {
		const statusInt = parseInt(statusFilter);
		if (statusInt === 0) status = TeamStatus.UNREADY;
		else if (statusInt === 1) status = TeamStatus.PENDING;
		else if (statusInt === 2) status = TeamStatus.READY;
		else if (statusInt === 3) status = TeamStatus.DEAD;
	}

	// Get total count for pagination
	const totalTeams = await countTeams({ search, divisionId, regionId, status, seasonId });

	// Fetch teams with pagination
	const teams = await getTeams({
		search,
		divisionId,
		regionId,
		status,
		seasonId,
		page,
		pageSize
	});

	// Fetch divisions for filter
	const divisions = await getDivisionsForFilter();

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
			// Parse status enum
			let teamStatus: TeamStatus | undefined;
			if (status) {
				const statusInt = parseInt(status);
				if (statusInt === -1) teamStatus = TeamStatus.DEAD;
				else if (statusInt === 0) teamStatus = TeamStatus.UNREADY;
				else if (statusInt === 1) teamStatus = TeamStatus.PENDING;
				else if (statusInt === 2) teamStatus = TeamStatus.READY;
				else if (statusInt === 3) teamStatus = TeamStatus.PLACEMENT;
			}

			await updateTeam(teamId, {
				name,
				acronym,
				seasonId: seasonId === 'none' ? null : seasonId ? parseInt(seasonId) : null,
				divisionId: divisionId === 'none' ? null : divisionId ? parseInt(divisionId) : null,
				regionId: regionId === 'none' ? null : regionId ? parseInt(regionId) : null,
				status: teamStatus
			});

			return { success: true, message: 'Team updated successfully!' };
		} catch (error) {
			console.error('Error updating team:', error);
			return fail(400, { error: error instanceof Error ? error.message : 'Failed to update team' });
		}
	}
};
