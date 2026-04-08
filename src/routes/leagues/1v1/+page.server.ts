import type { PageServerLoad, Actions } from './$types';
import { getSeasons, getSeasonInfo, updateSeasonInfo } from '$lib/server/services/seasons';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getTeamsByDivision, findRecent1v1SeasonWithEntries } from '$lib/server/services/teams';
import { getStaffMembers, isUserSignedUpForFormat } from '$lib/server/services/users';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { isAdmin, requireAdmin } from '$lib/server/auth/permissions';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { z } from 'zod';

const updateSeasonInfoSchema = z.object({
  seasonId: z.coerce.number().int().positive('Invalid season ID'),
  info: z.string().optional().default(''),
});

export const load: PageServerLoad = async ({ url, locals }) => {
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
    const defaultSeasonWithEntries = await findRecent1v1SeasonWithEntries(
      ['UNREADY', 'PENDING', 'READY', 'DEAD'],
      FORMAT_1V1,
    );

    // Determine selected season and region
    let selectedSeasonId: number | undefined;
    let selectedRegionId: number | undefined;

    if (seasonParam && regionParam) {
      // User specified both via URL - verify it's a 1v1 season
      const requestedSeasonId = parseInt(seasonParam);
      const requestedSeason = seasons1v1.find((s) => s.id === requestedSeasonId);
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

    const entriesByDivision = await Promise.all(
      divisions.map(async (division) => {
        const teams = await getTeamsByDivision(division.id, selectedSeasonId!, selectedRegionId!, [
          'UNREADY',
          'PENDING',
          'READY',
          'DEAD',
        ]);

        // Transform to show player info instead of team info
        // The "team" name is actually the player's frozen Steam name for 1v1
        const entries = teams
          // Filter out DEAD entries that never played (didn't affect placements)
          .filter((team: any) => team.status !== 'DEAD' || team.wins + team.losses > 0)
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
              status: team.status,
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

    // Convert map to array and sort divisions by ID (descending)
    const staffByDivision = Array.from(staffByDivisionMap.values()).sort(
      (a, b) => b.division.id - a.division.id,
    );

    let userAlreadySignedUp = false;
    if (locals.user) {
      userAlreadySignedUp = await isUserSignedUpForFormat(locals.user.steamId, FORMAT_1V1);
    }

    const seasonInfo = selectedSeasonId ? await getSeasonInfo(selectedSeasonId) : null;

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
    const validation = validateForm(formData, updateSeasonInfoSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId, info } = validation.data;

    await updateSeasonInfo(seasonId, info || null);
    return formSuccess({ seasonInfo: info }, 'Season info updated');
  },
};
