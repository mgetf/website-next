import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getSignupContext } from '$lib/server/services/teamSignup';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	const context = await getSignupContext(locals.user.steamId);

	// Determine if user can create a new team
	let canCreateNew = true;
	let createDisabledReason = '';
	
	if (context.signupClosed) {
		canCreateNew = false;
		createDisabledReason = 'Team signups are currently closed';
	} else if (context.hasActiveTeam) {
		canCreateNew = false;
		createDisabledReason = 'You are already in an active 2v2 team';
	} else if (context.rosterLocked) {
		canCreateNew = false;
		createDisabledReason = 'Rosters are currently locked';
	}

	// Determine if user can re-register a team
	let canReregister = true;
	let reregisterDisabledReason = '';
	
	if (context.signupClosed) {
		canReregister = false;
		reregisterDisabledReason = 'Team signups are currently closed';
	} else if (context.ownedTeams.length === 0) {
		canReregister = false;
		reregisterDisabledReason = 'You have no teams available to re-register';
	} else if (context.hasActiveTeam) {
		canReregister = false;
		reregisterDisabledReason = 'You are already in an active 2v2 team';
	} else if (context.rosterLocked) {
		canReregister = false;
		reregisterDisabledReason = 'Rosters are currently locked';
	}

	return {
		signupClosed: context.signupClosed,
		ownedTeams: context.ownedTeams,
		hasOwnedTeams: context.ownedTeams.length > 0,
		canCreateNew,
		createDisabledReason,
		canReregister,
		reregisterDisabledReason
	};
};


