import type { PageServerLoad } from './$types';
import { getSignupContext } from '$lib/server/services/teamSignup';
import { get1v1SignupContext } from '$lib/server/services/signup1v1';
import { getOpenSignupFormats } from '$lib/server/services/signupSeasons';
import { getPlayerCurrentTeamName } from '$lib/server/services/teams';
import { getCurrentSignupSeasonIds } from '$lib/server/services/signupSeasons';

interface FormatSignupInfo {
  format: {
    id: number;
    name: string;
    code: string;
    isIndividual: boolean;
    supportsReregistration: boolean;
    themeKey: string;
  };
  canSignup: boolean;
  disabledReason?: string;
  canReregister?: boolean;
  reregisterDisabledReason?: string;
  currentTeamName?: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  const steamId = locals.user?.steamId ?? null;

  const openFormats = await getOpenSignupFormats();
  const allSignupsClosed = openFormats.length === 0;

  const formatSignups: FormatSignupInfo[] = [];

  for (const format of openFormats) {
    if (format.isIndividual) {
      // Handle individual format (1v1)
      const context = await get1v1SignupContext(steamId, format.id);

      formatSignups.push({
        format,
        canSignup: !context.signupClosed && !context.hasActive1v1Entry,
        disabledReason: context.signupClosed
          ? `${format.name} signups are currently closed`
          : context.hasActive1v1Entry
            ? `You are already signed up for the ${format.name} league this season`
            : undefined,
      });
    } else {
      // Handle team format
      const context = await getSignupContext(steamId, format.id);

      let currentTeamName = '';
      if (context.hasActiveTeam && steamId) {
        const currentSignupSeasonIds = await getCurrentSignupSeasonIds(format.id);
        currentTeamName = await getPlayerCurrentTeamName(
          steamId,
          format.id,
          currentSignupSeasonIds,
        );
      }

      let canCreateNew = true;
      let createDisabledReason = '';

      if (context.signupClosed) {
        canCreateNew = false;
        createDisabledReason = `${format.name} signups are currently closed. Check our Discord for announcements about when signups will open.`;
      } else if (context.hasActiveTeam) {
        canCreateNew = false;
        createDisabledReason = currentTeamName
          ? `You're already on "${currentTeamName}" this season. Leave your current team first to create a new one.`
          : "You're already on a team this season. Leave your current team first to create a new one.";
      } else if (context.rosterLocked) {
        canCreateNew = false;
        createDisabledReason =
          'Rosters are currently locked for the season. New teams cannot be created until the next signup period.';
      }

      let canReregister = true;
      let reregisterDisabledReason = '';

      if (format.supportsReregistration) {
        if (context.signupClosed) {
          canReregister = false;
          reregisterDisabledReason = `${format.name} signups are currently closed. Check our Discord for announcements about when signups will open.`;
        } else if (steamId && context.ownedTeams.length === 0) {
          canReregister = false;
          reregisterDisabledReason =
            'You don\'t own any teams from previous seasons. Use "Create New Team" instead to get started.';
        } else if (context.hasActiveTeam) {
          canReregister = false;
          reregisterDisabledReason = currentTeamName
            ? `You're already on "${currentTeamName}" this season. Leave your current team first to re-register another team.`
            : "You're already on a team this season. Leave your current team first to re-register another.";
        } else if (context.rosterLocked) {
          canReregister = false;
          reregisterDisabledReason =
            'Rosters are currently locked for the season. Teams cannot be re-registered until the next signup period.';
        }
      }

      formatSignups.push({
        format,
        canSignup: canCreateNew,
        disabledReason: createDisabledReason,
        canReregister: format.supportsReregistration ? canReregister : undefined,
        reregisterDisabledReason: format.supportsReregistration
          ? reregisterDisabledReason
          : undefined,
        currentTeamName,
      });
    }
  }

  return {
    allSignupsClosed,
    formatSignups,
  };
};
