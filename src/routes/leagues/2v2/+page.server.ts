import type { PageServerLoad } from './$types';
import { getSeasons } from '$lib/server/services/seasons';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import {
  getTeamsByDivision,
  findRecentSeasonWithTeams,
} from '$lib/server/services/teams';
import { getStaffMembers, isUserSignedUpForSeason } from '$lib/server/services/users';
import { FORMAT_2V2 } from '$lib/server/constants/formats';

export const load: PageServerLoad = async ({ url, locals }) => {
  try {
    // Get query parameters (if any)
    const seasonParam = url.searchParams.get('season');
    const regionParam = url.searchParams.get('region');

    // Fetch all regions first (only visible ones)
    const allRegions = await getVisibleRegions();
    const visibleRegionIds = new Set(allRegions.map((r) => r.id));

    // Fetch all seasons and filter to only visible regions AND 2v2 format
    const allSeasonsRaw = await getSeasons();
    const allSeasons = allSeasonsRaw.filter(
      (s) => visibleRegionIds.has(s.regionId) && s.formatId === FORMAT_2V2,
    );

    // Find the most recent 2v2 season that has teams (any status, including historical)
    // This ensures we show a season with actual data by default
    let defaultSeasonWithTeams = await findRecentSeasonWithTeams(
      ['UNREADY', 'PENDING', 'READY', 'PLACEMENT', 'DEAD'],
      FORMAT_2V2,
    );

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
    const divisions = await getVisibleDivisions();

    // Fetch teams for each division in the selected season/region
    // Include all team statuses (UNREADY, PENDING, READY, PLACEMENT, DEAD) to show historical data
    // DEAD teams are included so past seasons can show teams that played but later disbanded
    const teamsByDivision = await Promise.all(
      divisions.map(async (division) => {
        const teams = await getTeamsByDivision(
          division.id,
          selectedSeasonId!,
          selectedRegionId!,
          ['UNREADY', 'PENDING', 'READY', 'PLACEMENT', 'DEAD'],
        );

        return {
          division: {
            id: division.id,
            name: division.name,
          },
          teams,
        };
      }),
    );

    // Fetch staff members (users with MODERATOR or ADMIN permission level)
    const allStaff = await getStaffMembers();

    // Create a set of division IDs that belong to the selected region
    const regionDivisionIds = new Set(
      divisions
        .filter((d) => d.regionId === selectedRegionId)
        .map((d) => d.id),
    );

    // Group staff by division (filtered to selected region only)
    const staffByDivisionMap = new Map<
      number,
      {
        division: { id: number; name: string };
        staff: Array<{
          steamId: string;
          name: string;
          avatar: string | null;
          role: string;
        }>;
      }
    >();

    allStaff.forEach((staff) => {
      if (!staff.staffDivisionId) return; // Skip staff without a division assigned

      // Only include staff for divisions in the selected region
      if (!regionDivisionIds.has(staff.staffDivisionId)) return;

      if (!staffByDivisionMap.has(staff.staffDivisionId)) {
        staffByDivisionMap.set(staff.staffDivisionId, {
          division: {
            id: staff.staffDivisionId,
            name: staff.staffDivision?.name || 'Unknown',
          },
          staff: [],
        });
      }

      staffByDivisionMap.get(staff.staffDivisionId)!.staff.push({
        steamId: staff.steamId,
        name: staff.steamUsername,
        avatar: staff.steamAvatar,
        role: staff.permissionLevel === 'ADMIN' ? 'Head Admin' : 'Moderator',
      });
    });

    // Sort staff within each division by role (Head Admins first), then by name
    staffByDivisionMap.forEach((divisionData) => {
      divisionData.staff.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'Head Admin' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    });

    // Convert map to array and sort divisions by ID (descending, like old website)
    const staffByDivision = Array.from(staffByDivisionMap.values()).sort(
      (a, b) => b.division.id - a.division.id,
    );

    // Get selected region and season info
    const selectedRegion = allRegions.find((r) => r.id === selectedRegionId);
    const selectedSeason = allSeasons.find((s) => s.id === selectedSeasonId);

    // Check if the current user is already signed up for this season
    let userAlreadySignedUp = false;
    if (locals.user && selectedSeasonId) {
      userAlreadySignedUp = await isUserSignedUpForSeason(
        locals.user.steamId,
        selectedSeasonId,
        FORMAT_2V2,
      );
    }

    return {
      seasons: allSeasons.map((s) => ({
        id: s.id,
        name: `Season ${s.seasonNum}`,
        seasonNum: s.seasonNum,
        regionId: s.regionId,
      })),
      regions: allRegions.map((r) => ({
        id: r.id,
        name: r.name,
      })),
      selectedSeasonId,
      selectedRegionId,
      selectedRegionName: selectedRegion?.name || 'Unknown',
      selectedSeasonNum: selectedSeason?.seasonNum || 0,
      teamsByDivision: teamsByDivision.filter((d) => d.teams.length > 0), // Only show divisions with teams
      staffByDivision: staffByDivision, // Show all staff (even if empty - will be handled in UI)
      deadlines: {
        // Use per-season settings instead of global
        signupClosed: !selectedSeason?.signupsOpen,
        rosterLocked: selectedSeason?.rosterLocked ?? false,
        paymentRequired: selectedSeason?.paymentRequired ?? false,
      },
      userAlreadySignedUp,
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
        paymentRequired: false,
      },
      userAlreadySignedUp: false,
    };
  }
};
