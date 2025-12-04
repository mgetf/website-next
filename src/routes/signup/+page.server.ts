import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getSignupContext } from '$lib/server/services/teamSignup';
import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	const context = await getSignupContext(locals.user.steamId);

	// Get user's current team name if they have one (for better error messages)
	let currentTeamName = '';
	if (context.hasActiveTeam) {
		const currentSignupSeasonIds = [
			context.naSignupSeasonId,
			context.euSignupSeasonId,
			context.ausSignupSeasonId,
			context.saSignupSeasonId,
			context.asiaSignupSeasonId
		].filter((id): id is number => id !== null);

		const membership = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: locals.user.steamId,
				active: 1,
				team: {
					is1v1: 0,
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


