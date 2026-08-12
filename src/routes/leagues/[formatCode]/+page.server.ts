import type { PageServerLoad, Actions } from './$types';
import { requireFormatByCode } from '$lib/server/services/formats';
import { getSeasons, getSeasonInfo, updateSeasonInfo } from '$lib/server/services/seasons';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getTeamsByDivision, findRecentSeasonWithTeams } from '$lib/server/services/teams';
import { getStaffMembers, isUserSignedUpForFormat } from '$lib/server/services/users';
import { getGlobalSettings } from '$lib/server/services/settings';
import { isAdmin, requireAdmin } from '$lib/server/auth/permissions';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { z } from 'zod';

const updateSeasonInfoSchema = z.object({
  seasonId: z.coerce.number().int().positive('Invalid season ID'),
  info: z.string().optional().default(''),
});

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const format = await requireFormatByCode(params.formatCode);

  const seasonParam = url.searchParams.get('season');
  const regionParam = url.searchParams.get('region');

  const [allRegions, globalSettings] = await Promise.all([
    getVisibleRegions(),
    getGlobalSettings(),
  ]);
  const visibleRegionIds = new Set(allRegions.map((r) => r.id));

  const visibleStatuses = globalSettings?.standingsVisibleStatuses?.length
    ? globalSettings.standingsVisibleStatuses
    : ['READY', 'PENDING'];

  const allSeasonsRaw = await getSeasons();
  const allSeasons = allSeasonsRaw.filter(
    (s) => visibleRegionIds.has(s.regionId) && s.formatId === format.id,
  );

  let selectedSeasonId: number | null = null;
  let selectedRegionId: number | null = null;

  const seasonFromUrl = seasonParam ? Number.parseInt(seasonParam, 10) : Number.NaN;
  const regionFromUrl = regionParam ? Number.parseInt(regionParam, 10) : Number.NaN;

  if (
    Number.isFinite(seasonFromUrl) &&
    Number.isFinite(regionFromUrl) &&
    allSeasons.some((s) => s.id === seasonFromUrl && s.regionId === regionFromUrl)
  ) {
    selectedSeasonId = seasonFromUrl;
    selectedRegionId = regionFromUrl;
  } else {
    const defaultSeasonWithTeams = await findRecentSeasonWithTeams(visibleStatuses, format.id);
    const defaultFromTeams =
      defaultSeasonWithTeams &&
      allSeasons.find(
        (s) =>
          s.id === defaultSeasonWithTeams.seasonId &&
          s.regionId === defaultSeasonWithTeams.regionId,
      );

    if (defaultFromTeams) {
      selectedSeasonId = defaultFromTeams.id;
      selectedRegionId = defaultFromTeams.regionId;
    } else if (allSeasons[0]) {
      selectedSeasonId = allSeasons[0].id;
      selectedRegionId = allSeasons[0].regionId;
    }
  }

  const divisions = await getVisibleDivisions();

  const teamsByDivision =
    selectedSeasonId != null && selectedRegionId != null
      ? await Promise.all(
          divisions.map(async (division) => {
            const teams = await getTeamsByDivision(
              division.id,
              selectedSeasonId,
              selectedRegionId,
              visibleStatuses,
            );

            const filtered = teams
              .filter((team: any) => team.status !== 'DEAD' || team.wins + team.losses > 0)
              .map((team: any) => {
                if (format.isIndividual) {
                  const player = team.players?.[0];
                  return {
                    ...team,
                    isWithdrawn: team.status === 'DEAD',
                    playerName: player?.player?.steamUsername || team.name,
                    playerId: player?.playerSteamId,
                    playerAvatar: player?.player?.steamAvatar || team.avatar,
                  };
                }
                return {
                  ...team,
                  isWithdrawn: team.status === 'DEAD',
                };
              });

            return {
              division: {
                id: division.id,
                name: division.name,
              },
              teams: filtered,
            };
          }),
        )
      : [];

  const allStaff = selectedRegionId != null ? await getStaffMembers() : [];

  const regionDivisionIds = new Set(
    divisions.filter((d) => d.regionId === selectedRegionId).map((d) => d.id),
  );

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

  staffByDivisionMap.forEach((divisionData) => {
    divisionData.staff.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'Head Admin' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  });

  const staffByDivision = Array.from(staffByDivisionMap.values()).sort(
    (a, b) => b.division.id - a.division.id,
  );

  const selectedRegion = allRegions.find((r) => r.id === selectedRegionId);
  const selectedSeason = allSeasons.find((s) => s.id === selectedSeasonId);

  let userAlreadySignedUp = false;
  if (locals.user) {
    userAlreadySignedUp = await isUserSignedUpForFormat(locals.user.steamId, format.id);
  }

  const seasonInfo = selectedSeasonId != null ? await getSeasonInfo(selectedSeasonId) : null;

  return {
    format: {
      id: format.id,
      name: format.name,
      code: format.code,
      isIndividual: format.isIndividual,
      themeKey: format.themeKey,
    },
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
};

export const actions: Actions = {
  updateSeasonInfo: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateSeasonInfoSchema);
    if (!validation.success) return validationError(validation.errors);

    const { seasonId, info } = validation.data;

    try {
      await updateSeasonInfo(seasonId, info || null);
      return formSuccess({ seasonInfo: info }, 'Season info updated');
    } catch (err) {
      return formError(err instanceof Error ? err.message : 'Failed to update season info', 500);
    }
  },
};
