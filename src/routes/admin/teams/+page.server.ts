import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { TeamStatus } from '$prisma/client.js';
import { fail } from '@sveltejs/kit';
import { getSeasonsForFilter } from '$lib/server/services/seasons';
import { getRegionsForFilter } from '$lib/server/services/regions';
import { getDivisionsForFilter } from '$lib/server/services/divisions';
import { getTeams, countTeams, updateTeam } from '$lib/server/services/teams';
import { disbandTeam } from '$lib/server/services/teamManagement';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';

// Zod schema for team update form
const updateTeamSchema = z.object({
	teamId: z.coerce.number().int().positive('Invalid team ID'),
	name: z.string().min(1, 'Team name is required').max(50, 'Team name too long'),
	acronym: z.string().max(6, 'Acronym too long').optional().default(''),
	seasonId: z.string().optional(),
	divisionId: z.string().optional(),
	regionId: z.string().optional(),
	status: z.string().optional()
});

// Zod schema for team disband form
const disbandTeamSchema = z.object({
	teamId: z.coerce.number().int().positive('Invalid team ID')
});

// Zod schema for 1v1 restore form
const restore1v1Schema = z.object({
	teamId: z.coerce.number().int().positive('Invalid team ID')
});

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
			formatId: team.formatId,
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

		// Validate form data with Zod
		const validation = validateForm(formData, updateTeamSchema);
		if (!validation.success) {
			return validationError(validation.errors, 'Invalid form data');
		}

		const { teamId, name, acronym, seasonId, divisionId, regionId, status } = validation.data;

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
	},

	disbandTeam: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();

		// Validate form data with Zod
		const validation = validateForm(formData, disbandTeamSchema);
		if (!validation.success) {
			return validationError(validation.errors, 'Invalid form data');
		}

		const { teamId } = validation.data;

		try {
			await disbandTeam(teamId);
			return { success: true, message: 'Team disbanded successfully!' };
		} catch (error) {
			console.error('Error disbanding team:', error);
			return fail(400, { error: error instanceof Error ? error.message : 'Failed to disband team' });
		}
	},

	restore1v1: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();

		// Validate form data with Zod
		const validation = validateForm(formData, restore1v1Schema);
		if (!validation.success) {
			return validationError(validation.errors, 'Invalid form data');
		}

		const { teamId } = validation.data;

		try {
			const { restore1v1Entry } = await import('$lib/server/services/signup1v1');
			await restore1v1Entry(teamId);
			return { success: true, message: 'Player restored successfully!' };
		} catch (error) {
			console.error('Error restoring 1v1 entry:', error);
			return fail(400, { error: error instanceof Error ? error.message : 'Failed to restore player' });
		}
	}
};
