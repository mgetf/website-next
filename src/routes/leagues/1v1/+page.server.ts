import type { PageServerLoad } from './$types';
import { getSeasons } from '$lib/server/services/seasons';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getTeamsByDivision } from '$lib/server/services/teams';
import { prisma } from '$lib/server/db';
import { FORMAT_1V1 } from '$lib/server/constants/formats';

/**
 * Find the most recent 1v1 season that has entries
 */
async function findRecent1v1SeasonWithEntries(
  statuses: string[],
): Promise<{ seasonId: number; regionId: number } | null> {
  const result = await prisma.team.findFirst({
    where: {
      formatId: FORMAT_1V1,
      status: { in: statuses as any },
    },
    select: {
      seasonId: true,
      regionId: true,
      season: {
        select: { seasonNum: true },
      },
    },
    orderBy: [{ season: { seasonNum: 'desc' } }],
  });

  if (result && result.seasonId && result.regionId) {
    return { seasonId: result.seasonId, regionId: result.regionId };
  }
  return null;
}

export const load: PageServerLoad = async ({ url }) => {
  try {
    // Get query parameters (if any)
    const seasonParam = url.searchParams.get('season');
    const regionParam = url.searchParams.get('region');

    // Fetch all regions first (only visible ones)
    const allRegions = await getVisibleRegions();
    const visibleRegionIds = new Set(allRegions.map((r) => r.id));

    // Fetch all seasons and filter to 1v1 only, AND only for visible regions
    const allSeasons = await getSeasons();
    const seasons1v1 = allSeasons.filter(
      (s) => s.formatId === FORMAT_1V1 && visibleRegionIds.has(s.regionId),
    );

    // Find the most recent 1v1 season that has entries
    // For 1v1, only READY (active) and DEAD (withdrawn) states are valid
    const defaultSeasonWithEntries = await findRecent1v1SeasonWithEntries([
      'READY',
      'DEAD',
    ]);

    // Determine selected season and region
    let selectedSeasonId: number | undefined;
    let selectedRegionId: number | undefined;

    if (seasonParam && regionParam) {
      // User specified both via URL - verify it's a 1v1 season
      const requestedSeasonId = parseInt(seasonParam);
      const requestedSeason = seasons1v1.find(
        (s) => s.id === requestedSeasonId,
      );
      if (requestedSeason) {
        selectedSeasonId = requestedSeasonId;
        selectedRegionId = parseInt(regionParam);
      }
    }

    if (!selectedSeasonId) {
      if (defaultSeasonWithEntries) {
        // Default to the most recent season that has entries
        selectedSeasonId = defaultSeasonWithEntries.seasonId;
        selectedRegionId = defaultSeasonWithEntries.regionId;
      } else if (seasons1v1.length > 0) {
        // Fallback to first 1v1 season
        selectedSeasonId = seasons1v1[0].id;
        selectedRegionId = seasons1v1[0].regionId;
      } else {
        // No 1v1 seasons exist
        selectedSeasonId = 0;
        selectedRegionId = allRegions[0]?.id || 0;
      }
    }

    // Fetch all divisions (visible ones)
    const divisions = await getVisibleDivisions();

    // Fetch entries (1v1 teams) for each division in the selected season/region
    // For 1v1, only READY and DEAD are valid statuses
    // DEAD entries that affected placements (played matches) are shown with "WITHDRAWN" label
    const entriesByDivision = await Promise.all(
      divisions.map(async (division) => {
        const teams = await getTeamsByDivision(
          division.id,
          selectedSeasonId!,
          selectedRegionId!,
          ['READY', 'DEAD'],
        );

        // Transform to show player info instead of team info
        // The "team" name is actually the player's frozen Steam name for 1v1
        const entries = teams
          // Filter out DEAD entries that never played (didn't affect placements)
          .filter(
            (team: any) =>
              team.status !== 'DEAD' || team.wins + team.losses > 0,
          )
          .map((team: any) => {
            // Get the single player from this 1v1 entry
            const player = team.players?.[0]?.player;
            return {
              id: team.id,
              teamId: team.id, // For internal use
              name: team.name, // This is the frozen player name
              avatar: team.avatar, // This is the frozen player avatar
              steamId: player?.steamId || null,
              wins: team.wins,
              losses: team.losses,
              points: team.points,
              isWithdrawn: team.status === 'DEAD',
            };
          });

        return {
          division: {
            id: division.id,
            name: division.name,
          },
          entries,
        };
      }),
    );

    // Get selected region and season info
    const selectedRegion = allRegions.find((r) => r.id === selectedRegionId);
    const selectedSeason = seasons1v1.find((s) => s.id === selectedSeasonId);

    return {
      seasons: seasons1v1.map((s) => ({
        id: s.id,
        name: `Season ${s.seasonNum}`,
        seasonNum: s.seasonNum,
        regionId: s.regionId,
      })),
      regions: allRegions.map((r) => ({
        id: r.id,
        name: r.name,
      })),
      selectedSeasonId: selectedSeasonId || 0,
      selectedRegionId: selectedRegionId || 0,
      selectedRegionName: selectedRegion?.name || 'Unknown',
      selectedSeasonNum: selectedSeason?.seasonNum || 0,
      entriesByDivision: entriesByDivision.filter((d) => d.entries.length > 0),
      deadlines: {
        // Use per-season settings instead of global
        signupClosed: !selectedSeason?.signupsOpen,
        rosterLocked: selectedSeason?.rosterLocked ?? false,
        paymentRequired: selectedSeason?.paymentRequired ?? false,
      },
    };
  } catch (error) {
    console.error('Error loading 1v1 league page:', error);

    // Return fallback data
    return {
      seasons: [],
      regions: [],
      selectedSeasonId: 0,
      selectedRegionId: 0,
      selectedRegionName: 'Unknown',
      selectedSeasonNum: 0,
      entriesByDivision: [],
      deadlines: {
        signupClosed: true,
        rosterLocked: true,
        paymentRequired: false,
      },
    };
  }
};
