import type { PageServerLoad, Actions } from './$types';
import { getSeasons, getSeasonInfo, updateSeasonInfo } from '$lib/server/services/seasons';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getTeamsByDivision, findRecentSeasonWithTeams } from '$lib/server/services/teams';
import { getStaffMembers, isUserSignedUpForFormat } from '$lib/server/services/users';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { isAdmin, requireAdmin } from '$lib/server/auth/permissions';
import { formError, formSuccess } from '$lib/server/utils/forms';

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

    const teamsByDivision = await Promise.all(
      divisions.map(async (division) => {
        const teams = await getTeamsByDivision(division.id, selectedSeasonId!, selectedRegionId!, [
          'UNREADY',
          'PENDING',
          'READY',
          'PLACEMENT',
          'DEAD',
        ]);

        const filtered = teams
          .filter((team: any) => team.status !== 'DEAD' || team.wins + team.losses > 0)
          .map((team: any) => ({
            ...team,
            isWithdrawn: team.status === 'DEAD',
          }));

        return {
          division: {
            id: division.id,
            name: division.name,
          },
          teams: filtered,
        };
      }),
    );

    // Fetch staff members (users with MODERATOR or ADMIN permission level)
    const allStaff = await getStaffMembers();

    // Create a set of division IDs that belong to the selected region
    const regionDivisionIds = new Set(
      divisions.filter((d) => d.regionId === selectedRegionId).map((d) => d.id),
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
      if (staff.staffDivisions.length === 0) return;

      for (const div of staff.staffDivisions) {
        if (!regionDivisionIds.has(div.id)) continue;

        if (!staffByDivisionMap.has(div.id)) {
          staffByDivisionMap.set(div.id, {
            division: {
              id: div.id,
              name: div.name,
            },
            staff: [],
          });
        }

        staffByDivisionMap.get(div.id)!.staff.push({
          steamId: staff.steamId,
          name: staff.steamUsername,
          avatar: staff.steamAvatar,
          role: staff.permissionLevel === 'ADMIN' ? 'Head Admin' : 'Moderator',
        });
      }
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

    let userAlreadySignedUp = false;
    if (locals.user) {
      userAlreadySignedUp = await isUserSignedUpForFormat(locals.user.steamId, FORMAT_2V2);
    }

    const seasonInfo = selectedSeasonId ? await getSeasonInfo(selectedSeasonId) : null;

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
      teamsByDivision: teamsByDivision.filter((d) => d.teams.length > 0),
      staffByDivision,
      deadlines: {
        signupClosed: !selectedSeason?.signupsOpen,
        rosterLocked: selectedSeason?.rosterLocked ?? false,
        paymentRequired: selectedSeason?.paymentRequired ?? false,
      },
      userAlreadySignedUp,
      seasonInfo,
      isAdmin: isAdmin(locals.user),
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
      seasonInfo: null,
      isAdmin: false,
    };
  }
};

export const actions: Actions = {
  updateSeasonInfo: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const seasonId = parseInt(formData.get('seasonId') as string);
    const info = (formData.get('info') as string) || null;

    if (isNaN(seasonId)) {
      return formError('Invalid season ID', 400);
    }

    await updateSeasonInfo(seasonId, info);
    return formSuccess({ seasonInfo: info }, 'Season info updated');
  },
};
