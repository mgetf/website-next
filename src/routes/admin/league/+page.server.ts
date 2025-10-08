import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { prisma } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);

	// Fetch all seasons with their region and team count
	const seasons = await prisma.season.findMany({
		include: {
			region: true,
			_count: {
				select: {
					teams: true,
					matches: true
				}
			}
		},
		orderBy: {
			seasonNum: 'desc'
		}
	});

	// Fetch all regions (including hidden for admin)
	const allRegions = await prisma.region.findMany({
		include: {
			_count: {
				select: {
					seasons: true,
					teams: true
				}
			}
		},
		orderBy: {
			name: 'asc'
		}
	});

	// Fetch all divisions (including hidden for admin)
	const allDivisions = await prisma.division.findMany({
		include: {
			_count: {
				select: {
					teams: true
				}
			}
		},
		orderBy: {
			id: 'asc'
		}
	});

	// Fetch all arenas
	const allArenas = await prisma.arena.findMany({
		include: {
			_count: {
				select: {
					games: true
				}
			}
		},
		orderBy: {
			name: 'asc'
		}
	});

	// Fetch all map ban pools
	const allMapBanPools = await prisma.mapBanPool.findMany({
		include: {
			mapsInPool: {
				include: {
					arena: true
				},
				orderBy: {
					orderNum: 'asc'
				}
			},
			_count: {
				select: {
					matchMapBans: true
				}
			}
		},
		orderBy: {
			createdAt: 'desc'
		}
	});

	// Transform the data for the UI
	const seasonsData = seasons.map((season) => {
		// Calculate a basic status - you can adjust this logic
		// For now, we'll consider the most recent season as "Active"
		const isLatest = seasons[0]?.id === season.id;
		const hasMatches = season._count.matches > 0;
		
		let status = 'Completed';
		if (isLatest && season._count.teams > 0) {
			status = 'Active';
		} else if (season._count.teams === 0) {
			status = 'Draft';
		}

		return {
			id: season.id,
			seasonNum: season.seasonNum,
			region: season.region.name,
			regionId: season.regionId,
			numWeeks: season.numWeeks,
			teams: season._count.teams,
			matches: season._count.matches,
			status
		};
	});

	return {
		seasons: seasonsData,
		regions: allRegions.map((r) => ({
			id: r.id,
			name: r.name,
			hidden: r.hidden,
			seasons: r._count.seasons,
			teams: r._count.teams
		})),
		divisions: allDivisions.map((d) => ({
			id: d.id,
			name: d.name,
			signupCost: d.signupCost,
			hidden: d.hidden,
			teams: d._count.teams
		})),
		arenas: allArenas.map((a) => ({
			id: a.id,
			name: a.name,
			avatar: a.avatar,
			playoffMap: a.playoffMap,
			games: a._count.games
		})),
		mapBanPools: allMapBanPools.map((pool) => ({
			id: pool.id,
			name: pool.name,
			isActive: pool.isActive,
			maps: pool.mapsInPool.map((m) => ({
				id: m.arena.id,
				name: m.arena.name,
				avatar: m.arena.avatar,
				orderNum: m.orderNum
			})),
			matchesUsed: pool._count.matchMapBans
		}))
	};
};

export const actions: Actions = {
	createSeason: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const seasonNum = parseInt(formData.get('seasonNum') as string);
		const regionId = parseInt(formData.get('regionId') as string);
		const numWeeks = parseInt(formData.get('numWeeks') as string);

		// Validate inputs
		if (!seasonNum || seasonNum < 1) {
			return fail(400, { error: 'Invalid season number' });
		}
		if (!regionId || regionId < 1) {
			return fail(400, { error: 'Invalid region' });
		}
		if (!numWeeks || numWeeks < 1) {
			return fail(400, { error: 'Invalid number of weeks' });
		}

		try {
			// Check if season already exists
			const existingSeason = await prisma.season.findFirst({
				where: {
					seasonNum,
					regionId
				}
			});

			if (existingSeason) {
				return fail(400, { error: `Season ${seasonNum} already exists for this region` });
			}

			// Create the new season
			await prisma.season.create({
				data: {
					seasonNum,
					regionId,
					numWeeks
				}
			});

			return { success: true, message: 'Season created successfully!' };
		} catch (error) {
			console.error('Error creating season:', error);
			return fail(500, { error: 'Failed to create season' });
		}
	},

	updateSeason: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const seasonId = parseInt(formData.get('seasonId') as string);
		const seasonNum = parseInt(formData.get('seasonNum') as string);
		const regionId = parseInt(formData.get('regionId') as string);
		const numWeeks = parseInt(formData.get('numWeeks') as string);

		// Validate inputs
		if (!seasonId || seasonId < 1) {
			return fail(400, { error: 'Invalid season ID' });
		}
		if (!seasonNum || seasonNum < 1) {
			return fail(400, { error: 'Invalid season number' });
		}
		if (!regionId || regionId < 1) {
			return fail(400, { error: 'Invalid region' });
		}
		if (!numWeeks || numWeeks < 1) {
			return fail(400, { error: 'Invalid number of weeks' });
		}

		try {
			// Check if season exists
			const season = await prisma.season.findUnique({
				where: { id: seasonId }
			});

			if (!season) {
				return fail(404, { error: 'Season not found' });
			}

			// Check if changing to a season number that already exists for this region
			const conflictingSeason = await prisma.season.findFirst({
				where: {
					seasonNum,
					regionId,
					NOT: { id: seasonId }
				}
			});

			if (conflictingSeason) {
				return fail(400, { error: `Season ${seasonNum} already exists for this region` });
			}

			// Update the season
			await prisma.season.update({
				where: { id: seasonId },
				data: {
					seasonNum,
					regionId,
					numWeeks
				}
			});

			return { success: true, message: 'Season updated successfully!' };
		} catch (error) {
			console.error('Error updating season:', error);
			return fail(500, { error: 'Failed to update season' });
		}
	},

	deleteSeason: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const seasonId = parseInt(formData.get('seasonId') as string);

		// Validate input
		if (!seasonId || seasonId < 1) {
			return fail(400, { error: 'Invalid season ID' });
		}

		try {
			// Check if season exists
			const season = await prisma.season.findUnique({
				where: { id: seasonId },
				include: {
					_count: {
						select: {
							teams: true,
							matches: true
						}
					}
				}
			});

			if (!season) {
				return fail(404, { error: 'Season not found' });
			}

			// Check if season has teams or matches
			if (season._count.teams > 0 || season._count.matches > 0) {
				return fail(400, { 
					error: `Cannot delete season with ${season._count.teams} teams and ${season._count.matches} matches. Remove all teams and matches first.` 
				});
			}

			// Delete the season
			await prisma.season.delete({
				where: { id: seasonId }
			});

			return { success: true, message: 'Season deleted successfully!' };
		} catch (error) {
			console.error('Error deleting season:', error);
			return fail(500, { error: 'Failed to delete season' });
		}
	},

	// REGION ACTIONS
	createRegion: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Region name is required' });
		}

		try {
			const existingRegion = await prisma.region.findFirst({
				where: { name: { equals: name.trim(), mode: 'insensitive' } }
			});

			if (existingRegion) {
				return fail(400, { error: 'Region with this name already exists' });
			}

			await prisma.region.create({
				data: { name: name.trim(), hidden: 0 }
			});

			return { success: true, message: 'Region created successfully!' };
		} catch (error) {
			console.error('Error creating region:', error);
			return fail(500, { error: 'Failed to create region' });
		}
	},

	updateRegion: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);
		const name = formData.get('name') as string;

		if (!regionId || regionId < 1) {
			return fail(400, { error: 'Invalid region ID' });
		}
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Region name is required' });
		}

		try {
			const region = await prisma.region.findUnique({ where: { id: regionId } });
			if (!region) {
				return fail(404, { error: 'Region not found' });
			}

			const conflictingRegion = await prisma.region.findFirst({
				where: {
					name: { equals: name.trim(), mode: 'insensitive' },
					NOT: { id: regionId }
				}
			});

			if (conflictingRegion) {
				return fail(400, { error: 'Region with this name already exists' });
			}

			await prisma.region.update({
				where: { id: regionId },
				data: { name: name.trim() }
			});

			return { success: true, message: 'Region updated successfully!' };
		} catch (error) {
			console.error('Error updating region:', error);
			return fail(500, { error: 'Failed to update region' });
		}
	},

	toggleRegionVisibility: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);

		if (!regionId || regionId < 1) {
			return fail(400, { error: 'Invalid region ID' });
		}

		try {
			const region = await prisma.region.findUnique({ where: { id: regionId } });
			if (!region) {
				return fail(404, { error: 'Region not found' });
			}

			await prisma.region.update({
				where: { id: regionId },
				data: { hidden: region.hidden === 0 ? 1 : 0 }
			});

			return { success: true, message: `Region ${region.hidden === 0 ? 'hidden' : 'shown'} successfully!` };
		} catch (error) {
			console.error('Error toggling region visibility:', error);
			return fail(500, { error: 'Failed to toggle region visibility' });
		}
	},

	deleteRegion: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);

		if (!regionId || regionId < 1) {
			return fail(400, { error: 'Invalid region ID' });
		}

		try {
			const region = await prisma.region.findUnique({
				where: { id: regionId },
				include: {
					_count: {
						select: { seasons: true, teams: true }
					}
				}
			});

			if (!region) {
				return fail(404, { error: 'Region not found' });
			}

			if (region._count.seasons > 0 || region._count.teams > 0) {
				return fail(400, {
					error: `Cannot delete region with ${region._count.seasons} seasons and ${region._count.teams} teams.`
				});
			}

			await prisma.region.delete({ where: { id: regionId } });

			return { success: true, message: 'Region deleted successfully!' };
		} catch (error) {
			console.error('Error deleting region:', error);
			return fail(500, { error: 'Failed to delete region' });
		}
	},

	// DIVISION ACTIONS
	createDivision: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const signupCost = parseFloat(formData.get('signupCost') as string) || 0;

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Division name is required' });
		}

		try {
			const existingDivision = await prisma.division.findFirst({
				where: { name: { equals: name.trim(), mode: 'insensitive' } }
			});

			if (existingDivision) {
				return fail(400, { error: 'Division with this name already exists' });
			}

			await prisma.division.create({
				data: { name: name.trim(), signupCost, hidden: 0 }
			});

			return { success: true, message: 'Division created successfully!' };
		} catch (error) {
			console.error('Error creating division:', error);
			return fail(500, { error: 'Failed to create division' });
		}
	},

	updateDivision: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const divisionId = parseInt(formData.get('divisionId') as string);
		const name = formData.get('name') as string;
		const signupCost = parseFloat(formData.get('signupCost') as string) || 0;

		if (!divisionId || divisionId < 1) {
			return fail(400, { error: 'Invalid division ID' });
		}
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Division name is required' });
		}

		try {
			const division = await prisma.division.findUnique({ where: { id: divisionId } });
			if (!division) {
				return fail(404, { error: 'Division not found' });
			}

			const conflictingDivision = await prisma.division.findFirst({
				where: {
					name: { equals: name.trim(), mode: 'insensitive' },
					NOT: { id: divisionId }
				}
			});

			if (conflictingDivision) {
				return fail(400, { error: 'Division with this name already exists' });
			}

			await prisma.division.update({
				where: { id: divisionId },
				data: { name: name.trim(), signupCost }
			});

			return { success: true, message: 'Division updated successfully!' };
		} catch (error) {
			console.error('Error updating division:', error);
			return fail(500, { error: 'Failed to update division' });
		}
	},

	toggleDivisionVisibility: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const divisionId = parseInt(formData.get('divisionId') as string);

		if (!divisionId || divisionId < 1) {
			return fail(400, { error: 'Invalid division ID' });
		}

		try {
			const division = await prisma.division.findUnique({ where: { id: divisionId } });
			if (!division) {
				return fail(404, { error: 'Division not found' });
			}

			await prisma.division.update({
				where: { id: divisionId },
				data: { hidden: division.hidden === 0 ? 1 : 0 }
			});

			return { success: true, message: `Division ${division.hidden === 0 ? 'hidden' : 'shown'} successfully!` };
		} catch (error) {
			console.error('Error toggling division visibility:', error);
			return fail(500, { error: 'Failed to toggle division visibility' });
		}
	},

	deleteDivision: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const divisionId = parseInt(formData.get('divisionId') as string);

		if (!divisionId || divisionId < 1) {
			return fail(400, { error: 'Invalid division ID' });
		}

		try {
			const division = await prisma.division.findUnique({
				where: { id: divisionId },
				include: {
					_count: {
						select: { teams: true }
					}
				}
			});

			if (!division) {
				return fail(404, { error: 'Division not found' });
			}

			if (division._count.teams > 0) {
				return fail(400, {
					error: `Cannot delete division with ${division._count.teams} teams.`
				});
			}

			await prisma.division.delete({ where: { id: divisionId } });

			return { success: true, message: 'Division deleted successfully!' };
		} catch (error) {
			console.error('Error deleting division:', error);
			return fail(500, { error: 'Failed to delete division' });
		}
	},

	// ARENA ACTIONS
	createArena: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const avatar = formData.get('avatar') as string;
		const playoffMap = formData.get('playoffMap') === 'true' ? 1 : 0;

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Arena name is required' });
		}

		try {
			const existingArena = await prisma.arena.findFirst({
				where: { name: { equals: name.trim(), mode: 'insensitive' } }
			});

			if (existingArena) {
				return fail(400, { error: 'Arena with this name already exists' });
			}

			await prisma.arena.create({
				data: { name: name.trim(), avatar: avatar?.trim() || null, playoffMap }
			});

			return { success: true, message: 'Arena created successfully!' };
		} catch (error) {
			console.error('Error creating arena:', error);
			return fail(500, { error: 'Failed to create arena' });
		}
	},

	updateArena: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const arenaId = parseInt(formData.get('arenaId') as string);
		const name = formData.get('name') as string;
		const avatar = formData.get('avatar') as string;
		const playoffMap = formData.get('playoffMap') === 'true' ? 1 : 0;

		if (!arenaId || arenaId < 1) {
			return fail(400, { error: 'Invalid arena ID' });
		}
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Arena name is required' });
		}

		try {
			const arena = await prisma.arena.findUnique({ where: { id: arenaId } });
			if (!arena) {
				return fail(404, { error: 'Arena not found' });
			}

			const conflictingArena = await prisma.arena.findFirst({
				where: {
					name: { equals: name.trim(), mode: 'insensitive' },
					NOT: { id: arenaId }
				}
			});

			if (conflictingArena) {
				return fail(400, { error: 'Arena with this name already exists' });
			}

			await prisma.arena.update({
				where: { id: arenaId },
				data: { name: name.trim(), avatar: avatar?.trim() || null, playoffMap }
			});

			return { success: true, message: 'Arena updated successfully!' };
		} catch (error) {
			console.error('Error updating arena:', error);
			return fail(500, { error: 'Failed to update arena' });
		}
	},

	deleteArena: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const arenaId = parseInt(formData.get('arenaId') as string);

		if (!arenaId || arenaId < 1) {
			return fail(400, { error: 'Invalid arena ID' });
		}

		try {
			const arena = await prisma.arena.findUnique({
				where: { id: arenaId },
				include: {
					_count: {
						select: { games: true }
					}
				}
			});

			if (!arena) {
				return fail(404, { error: 'Arena not found' });
			}

			if (arena._count.games > 0) {
				return fail(400, {
					error: `Cannot delete arena with ${arena._count.games} games played on it.`
				});
			}

			await prisma.arena.delete({ where: { id: arenaId } });

			return { success: true, message: 'Arena deleted successfully!' };
		} catch (error) {
			console.error('Error deleting arena:', error);
			return fail(500, { error: 'Failed to delete arena' });
		}
	},

	// MAP BAN POOL ACTIONS
	createMapBanPool: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Map ban pool name is required' });
		}

		try {
			await prisma.mapBanPool.create({
				data: { name: name.trim(), isActive: false }
			});

			return { success: true, message: 'Map ban pool created successfully!' };
		} catch (error) {
			console.error('Error creating map ban pool:', error);
			return fail(500, { error: 'Failed to create map ban pool' });
		}
	},

	updateMapBanPool: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const poolId = parseInt(formData.get('poolId') as string);
		const name = formData.get('name') as string;

		if (!poolId || poolId < 1) {
			return fail(400, { error: 'Invalid pool ID' });
		}
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Pool name is required' });
		}

		try {
			const pool = await prisma.mapBanPool.findUnique({ where: { id: poolId } });
			if (!pool) {
				return fail(404, { error: 'Map ban pool not found' });
			}

			await prisma.mapBanPool.update({
				where: { id: poolId },
				data: { name: name.trim() }
			});

			return { success: true, message: 'Map ban pool updated successfully!' };
		} catch (error) {
			console.error('Error updating map ban pool:', error);
			return fail(500, { error: 'Failed to update map ban pool' });
		}
	},

	toggleMapBanPoolStatus: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const poolId = parseInt(formData.get('poolId') as string);

		if (!poolId || poolId < 1) {
			return fail(400, { error: 'Invalid pool ID' });
		}

		try {
			const pool = await prisma.mapBanPool.findUnique({ where: { id: poolId } });
			if (!pool) {
				return fail(404, { error: 'Map ban pool not found' });
			}

			await prisma.mapBanPool.update({
				where: { id: poolId },
				data: { isActive: !pool.isActive }
			});

			return { success: true, message: `Pool ${pool.isActive ? 'deactivated' : 'activated'} successfully!` };
		} catch (error) {
			console.error('Error toggling pool status:', error);
			return fail(500, { error: 'Failed to toggle pool status' });
		}
	},

	addMapsToPool: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const poolId = parseInt(formData.get('poolId') as string);
		const arenaIds = formData.getAll('arenaIds').map((id) => parseInt(id as string));

		if (!poolId || poolId < 1) {
			return fail(400, { error: 'Invalid pool ID' });
		}
		if (!arenaIds || arenaIds.length === 0) {
			return fail(400, { error: 'Please select at least one map' });
		}

		try {
			// Get current max order number
			const existingMaps = await prisma.mapInPool.findMany({
				where: { poolId },
				orderBy: { orderNum: 'desc' },
				take: 1
			});
			
			let nextOrderNum = existingMaps.length > 0 ? existingMaps[0].orderNum + 1 : 0;

			// Add each arena to the pool
			for (const arenaId of arenaIds) {
				// Check if already exists
				const existing = await prisma.mapInPool.findUnique({
					where: {
						poolId_arenaId: { poolId, arenaId }
					}
				});

				if (!existing) {
					await prisma.mapInPool.create({
						data: {
							poolId,
							arenaId,
							orderNum: nextOrderNum++
						}
					});
				}
			}

			return { success: true, message: 'Maps added to pool successfully!' };
		} catch (error) {
			console.error('Error adding maps to pool:', error);
			return fail(500, { error: 'Failed to add maps to pool' });
		}
	},

	removeMapFromPool: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const poolId = parseInt(formData.get('poolId') as string);
		const arenaId = parseInt(formData.get('arenaId') as string);

		if (!poolId || poolId < 1 || !arenaId || arenaId < 1) {
			return fail(400, { error: 'Invalid pool or arena ID' });
		}

		try {
			await prisma.mapInPool.delete({
				where: {
					poolId_arenaId: { poolId, arenaId }
				}
			});

			return { success: true, message: 'Map removed from pool successfully!' };
		} catch (error) {
			console.error('Error removing map from pool:', error);
			return fail(500, { error: 'Failed to remove map from pool' });
		}
	},

	deleteMapBanPool: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const poolId = parseInt(formData.get('poolId') as string);

		if (!poolId || poolId < 1) {
			return fail(400, { error: 'Invalid pool ID' });
		}

		try {
			const pool = await prisma.mapBanPool.findUnique({
				where: { id: poolId },
				include: {
					_count: {
						select: { matchMapBans: true }
					}
				}
			});

			if (!pool) {
				return fail(404, { error: 'Map ban pool not found' });
			}

			if (pool._count.matchMapBans > 0) {
				return fail(400, {
					error: `Cannot delete pool with ${pool._count.matchMapBans} matches using it.`
				});
			}

			// Delete associated maps first
			await prisma.mapInPool.deleteMany({
				where: { poolId }
			});

			// Then delete the pool
			await prisma.mapBanPool.delete({ where: { id: poolId } });

			return { success: true, message: 'Map ban pool deleted successfully!' };
		} catch (error) {
			console.error('Error deleting map ban pool:', error);
			return fail(500, { error: 'Failed to delete map ban pool' });
		}
	}
};

