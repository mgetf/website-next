import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getSignupContext } from '$lib/server/services/teamSignup';
import { get1v1SignupContext } from '$lib/server/services/signup1v1';
import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCurrentSignupSeasonIds, getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { FORMAT_2V2, FORMAT_1V1 } from '$lib/server/constants/formats';
import { getVisibleRegions } from '$lib/server/services/regions';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	const context = await getSignupContext(locals.user.steamId);

	// Get user's current team name if they have one (for better error messages)
	let currentTeamName = '';
	if (context.hasActiveTeam) {
		const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_2V2);

		const membership = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: locals.user.steamId,
				active: 1,
				team: {
					formatId: FORMAT_2V2,
					seasonId: { in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1] }
				}
			},
			include: { team: { select: { name: true } } }
		});
		currentTeamName = membership?.team?.name || '';
	}

	// Determine if user can create a new team
	let canCreateNew = true;
	let createDisabledReason = '';
	
	if (context.signupClosed) {
		canCreateNew = false;
		createDisabledReason = 'Team signups are currently closed. Check our Discord for announcements about when signups will open.';
	} else if (context.hasActiveTeam) {
		canCreateNew = false;
		createDisabledReason = currentTeamName 
			? `You're already on "${currentTeamName}" this season. Leave your current team first to create a new one.`
			: "You're already on a team this season. Leave your current team first to create a new one.";
	} else if (context.rosterLocked) {
		canCreateNew = false;
		createDisabledReason = 'Rosters are currently locked for the season. New teams cannot be created until the next signup period.';
	}

	// Determine if user can re-register a team
	let canReregister = true;
	let reregisterDisabledReason = '';
	
	if (context.signupClosed) {
		canReregister = false;
		reregisterDisabledReason = 'Team signups are currently closed. Check our Discord for announcements about when signups will open.';
	} else if (context.ownedTeams.length === 0) {
		canReregister = false;
		reregisterDisabledReason = 'You don\'t own any teams from previous seasons. Use "Create New Team" instead to get started.';
	} else if (context.hasActiveTeam) {
		canReregister = false;
		reregisterDisabledReason = currentTeamName 
			? `You're already on "${currentTeamName}" this season. Leave your current team first to re-register another team.`
			: "You're already on a team this season. Leave your current team first to re-register another.";
	} else if (context.rosterLocked) {
		canReregister = false;
		reregisterDisabledReason = 'Rosters are currently locked for the season. Teams cannot be re-registered until the next signup period.';
	}

	// Check 1v1 signup eligibility
	const context1v1 = await get1v1SignupContext(locals.user.steamId);

	// Check if there are any active 1v1 seasons
	const regions = await getVisibleRegions();
	let has1v1Seasons = false;
	for (const region of regions) {
		const seasonId = await getSignupSeasonForRegion(region.id, FORMAT_1V1);
		if (seasonId) {
			has1v1Seasons = true;
			break;
		}
	}

	let can1v1Signup = true;
	let signup1v1DisabledReason = '';

	if (context1v1.signupClosed) {
		can1v1Signup = false;
		signup1v1DisabledReason = '1v1 signups are currently closed';
	} else if (!has1v1Seasons) {
		can1v1Signup = false;
		signup1v1DisabledReason = 'No 1v1 seasons are currently open for signups';
	} else if (context1v1.hasActive1v1Entry) {
		can1v1Signup = false;
		signup1v1DisabledReason = 'You are already signed up for the 1v1 league this season';
	}

	return {
		signupClosed: context.signupClosed,
		ownedTeams: context.ownedTeams,
		hasOwnedTeams: context.ownedTeams.length > 0,
		canCreateNew,
		createDisabledReason,
		canReregister,
		reregisterDisabledReason,
		// 1v1 signup
		can1v1Signup,
		signup1v1DisabledReason,
		has1v1Seasons
	};
};


