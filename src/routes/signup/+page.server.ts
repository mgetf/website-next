import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getSignupContext } from '$lib/server/services/teamSignup';
import { get1v1SignupContext } from '$lib/server/services/signup1v1';
import {
  getCurrentSignupSeasonIds,
  hasAnyOpenSignup,
  getActiveFormatCodes,
} from '$lib/server/services/signupSeasons';
import { getPlayerCurrentTeamName } from '$lib/server/services/teams';
import { FORMAT_2V2 } from '$lib/server/constants/formats';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals.user);

  const allSignupsClosed = !(await hasAnyOpenSignup());

  // Get format-specific contexts
  const context = await getSignupContext(locals.user.steamId);
  const context1v1 = await get1v1SignupContext(locals.user.steamId);

  let currentTeamName = '';
  if (context.hasActiveTeam) {
    const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);
    currentTeamName = await getPlayerCurrentTeamName(
      locals.user.steamId,
      FORMAT_2V2,
      currentSignupSeasonIds,
    );
  }

  // Determine if user can create a new 2v2 team
  let canCreateNew = true;
  let createDisabledReason = '';

  if (context.signupClosed) {
    canCreateNew = false;
    createDisabledReason =
      'Team signups are currently closed. Check our Discord for announcements about when signups will open.';
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

  // Determine if user can re-register a 2v2 team
  let canReregister = true;
  let reregisterDisabledReason = '';

  if (context.signupClosed) {
    canReregister = false;
    reregisterDisabledReason =
      'Team signups are currently closed. Check our Discord for announcements about when signups will open.';
  } else if (context.ownedTeams.length === 0) {
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

  // Determine 1v1 signup eligibility
  let can1v1Signup = true;
  let signup1v1DisabledReason = '';

  if (context1v1.signupClosed) {
    can1v1Signup = false;
    signup1v1DisabledReason = '1v1 signups are currently closed';
  } else if (context1v1.hasActive1v1Entry) {
    can1v1Signup = false;
    signup1v1DisabledReason = 'You are already signed up for the 1v1 league this season';
  }

  const activeFormatCodes = await getActiveFormatCodes();

  return {
    allSignupsClosed,
    // 2v2 specific
    signupClosed: context.signupClosed,
    ownedTeams: context.ownedTeams,
    hasOwnedTeams: context.ownedTeams.length > 0,
    canCreateNew,
    createDisabledReason,
    canReregister,
    reregisterDisabledReason,
    // 1v1 specific
    can1v1Signup,
    signup1v1DisabledReason,
    // Format-agnostic: which formats have active seasons
    activeFormatCodes,
  };
};
