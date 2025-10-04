import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	try {
		// Get query parameters (if any)
		const seasonParam = url.searchParams.get('season');
		const regionParam = url.searchParams.get('region');

		// Fetch all seasons (for dropdown)
		const allSeasons = await prisma.season.findMany({
			include: {
				region: true
			},
			orderBy: [{ seasonNum: 'desc' }, { id: 'desc' }]
		});

		// Fetch all regions (for selector)
		const allRegions = await prisma.region.findMany({
			where: { hidden: 0 },
			orderBy: { id: 'asc' }
		});

		// Find the most recent season that has ready teams
		// This ensures we show a season with actual data by default
		let defaultSeasonWithTeams = await prisma.team.findFirst({
			where: {
				status: { in: [2, 3] } // READY or PLACEMENT
			},
			orderBy: {
				seasonId: 'desc'
			},
			select: {
				seasonId: true,
				regionId: true
			}
		});

		// Determine selected season and region
		let selectedSeasonId: number | undefined;
		let selectedRegionId: number | undefined;

		if (seasonParam && regionParam) {
			// User specified both via URL
			selectedSeasonId = parseInt(seasonParam);
			selectedRegionId = parseInt(regionParam);
		} else if (defaultSeasonWithTeams) {
			// Default to the most recent season that has teams
			selectedSeasonId = defaultSeasonWithTeams.seasonId || allSeasons[0]?.id;
			selectedRegionId = defaultSeasonWithTeams.regionId || allRegions[0]?.id;
		} else {
			// Fallback to first available
			selectedSeasonId = allSeasons[0]?.id;
			selectedRegionId = allRegions[0]?.id;
		}

		// Fetch all divisions (visible ones)
		// Order by ID descending to show highest divisions first (INVITE -> PREMIER -> INTERMEDIATE -> OPEN -> NEWCOMER)
		const divisions = await prisma.division.findMany({
			where: { hidden: 0 },
			orderBy: { id: 'desc' }
		});

		// Fetch teams for each division in the selected season/region
		// Include more team statuses to show more data (PENDING, READY, PLACEMENT)
		const teamsByDivision = await Promise.all(
			divisions.map(async (division) => {
				const teams = await prisma.team.findMany({
					where: {
						seasonId: selectedSeasonId,
						regionId: selectedRegionId,
						divisionId: division.id,
						status: { in: [1, 2, 3] } // PENDING, READY, or PLACEMENT
					},
					select: {
						id: true,
						name: true,
						acronym: true,
						avatar: true,
						wins: true,
						losses: true,
						gamesWon: true,
						gamesLost: true,
						pointsScored: true,
						pointsScoredAgainst: true,
						paymentStatus: true,
						players: {
							select: {
								playerSteamId: true,
								player: {
									select: {
										steamId: true,
										steamUsername: true
									}
								}
							}
						}
					}
					// Note: We can't sort by calculated field (avg points) in Prisma directly
					// So we'll sort in application code after fetching
				});

				// Calculate derived stats and sort by average points
				const teamsWithStats = teams
					.map((team) => {
						const totalGames = team.gamesWon + team.gamesLost;
						const avgPoints = totalGames > 0 ? team.pointsScored / totalGames : 0;
						
						return {
							id: team.id,
							name: team.name,
							acronym: team.acronym,
							avatar: team.avatar,
							wins: team.wins,
							losses: team.losses,
							points: parseFloat(avgPoints.toFixed(1)),
							paymentStatus: team.paymentStatus,
							_sortKey: avgPoints // temporary field for sorting
						};
					})
					.sort((a, b) => {
						// Sort by avg points DESC, then wins DESC, then losses ASC
						if (b._sortKey !== a._sortKey) return b._sortKey - a._sortKey;
						if (b.wins !== a.wins) return b.wins - a.wins;
						return a.losses - b.losses;
					})
					.map(({ _sortKey, ...team }) => team); // Remove temporary sort key

				return {
					division: {
						id: division.id,
						name: division.name
					},
					teams: teamsWithStats
				};
			})
		);

		// Fetch staff members - same approach as old website
		// Query all moderators with their user info and division info in one go
		const allModerators = await prisma.moderator.findMany({
			include: {
				user: {
					select: {
						steamId: true,
						steamUsername: true,
						steamAvatar: true
					}
				},
				division: {
					select: {
						id: true,
						name: true
					}
				}
			}
		});

		// Group moderators by division
		const staffByDivisionMap = new Map<number, {
			division: { id: number; name: string };
			staff: Array<{
				steamId: string;
				name: string;
				avatar: string | null;
				role: string;
			}>;
		}>();

		allModerators.forEach((mod) => {
			if (!mod.divisionId) return; // Skip moderators without a division assigned
			
			if (!staffByDivisionMap.has(mod.divisionId)) {
				staffByDivisionMap.set(mod.divisionId, {
					division: {
						id: mod.divisionId,
						name: mod.division?.name || 'Unknown'
					},
					staff: []
				});
			}
			
			staffByDivisionMap.get(mod.divisionId)!.staff.push({
				steamId: mod.steamId,
				name: mod.user.steamUsername,
				avatar: mod.user.steamAvatar,
				role: mod.staffType === 0 ? 'Head Admin' : 'Moderator'
			});
		});

		// Sort staff within each division by staffType (Head Admins first), then by name
		staffByDivisionMap.forEach((divisionData) => {
			divisionData.staff.sort((a, b) => {
				if (a.role !== b.role) {
					return a.role === 'Head Admin' ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
		});

		// Convert map to array and sort divisions by ID (descending, like old website)
		const staffByDivision = Array.from(staffByDivisionMap.values())
			.sort((a, b) => b.division.id - a.division.id);

		// Fetch global settings for deadlines
		const globalSettings = await prisma.global.findFirst();

		// Get selected region info
		const selectedRegion = allRegions.find((r) => r.id === selectedRegionId);
		const selectedSeason = allSeasons.find((s) => s.id === selectedSeasonId);

		return {
			seasons: allSeasons.map((s) => ({
				id: s.id,
				name: `Season ${s.seasonNum}`,
				seasonNum: s.seasonNum,
				regionId: s.regionId,
				regionName: s.region.name
			})),
			regions: allRegions.map((r) => ({
				id: r.id,
				name: r.name
			})),
			selectedSeasonId,
			selectedRegionId,
			selectedRegionName: selectedRegion?.name || 'Unknown',
			selectedSeasonNum: selectedSeason?.seasonNum || 0,
			teamsByDivision: teamsByDivision.filter((d) => d.teams.length > 0), // Only show divisions with teams
			staffByDivision: staffByDivision, // Show all staff (even if empty - will be handled in UI)
			deadlines: {
				signupClosed: globalSettings?.signupClosed === 1,
				rosterLocked: globalSettings?.rosterLocked === 1,
				paymentRequired: globalSettings?.paymentRequired === 1
			}
		};
	} catch (error) {
		console.error('Error loading 2v2 league page:', error);
		
		// Return fallback data
		return {
			seasons: [],
			regions: [],
			selectedSeasonId: 0,
			selectedRegionId: 0,
			selectedRegionName: 'Unknown',
			selectedSeasonNum: 0,
			teamsByDivision: [],
			staffByDivision: [],
			deadlines: {
				signupClosed: true,
				rosterLocked: true,
				paymentRequired: false
			}
		};
	}
};

