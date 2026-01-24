import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { get1v1SignupContext, signup1v1 } from '$lib/server/services/signup1v1';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import { getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	const context = await get1v1SignupContext(locals.user.steamId);

	// Load divisions and regions
	const [divisions, regions] = await Promise.all([getVisibleDivisions(), getVisibleRegions()]);

	// Determine if user can sign up and why not
	let canSignup = true;
	let disabledReason = '';

	if (context.signupClosed) {
		canSignup = false;
		disabledReason = 'Signups are currently closed';
	} else if (context.hasActive1v1Entry) {
		canSignup = false;
		disabledReason = 'You are already signed up for the 1v1 league this season';
	}

	// Check which regions have active 1v1 signup seasons
	const regionsWithSeasons = await Promise.all(
		regions.map(async (region) => {
			const seasonId = await getSignupSeasonForRegion(region.id, FORMAT_1V1);
			return {
				...region,
				has1v1Season: !!seasonId
			};
		})
	);

	// Filter to only regions with 1v1 seasons
	const availableRegions = regionsWithSeasons.filter((r) => r.has1v1Season);

	if (canSignup && availableRegions.length === 0) {
		canSignup = false;
		disabledReason = 'No 1v1 seasons are currently open for signups in any region';
	}

	return {
		divisions,
		regions: availableRegions,
		canSignup,
		disabledReason,
		user: context.user
	};
};

export const actions: Actions = {
	signup: async ({ request, locals }) => {
		requireAuth(locals.user);

		const context = await get1v1SignupContext(locals.user.steamId);

		// Check if signups are closed
		if (context.signupClosed) {
			return fail(400, { error: 'Signups are currently closed' });
		}

		// Check if already signed up
		if (context.hasActive1v1Entry) {
			return fail(400, { error: 'You are already signed up for the 1v1 league this season' });
		}

		const formData = await request.formData();
		const divisionId = parseInt(formData.get('divisionId') as string);
		const regionId = parseInt(formData.get('regionId') as string);

		// Validate required fields
		if (!divisionId || !regionId) {
			return fail(400, { error: 'Division and region are required' });
		}

		try {
			// Get the correct season ID for the selected region
			const seasonId = await getSignupSeasonForRegion(regionId, FORMAT_1V1);

			if (!seasonId) {
				return fail(400, { error: 'No active 1v1 signup season for this region' });
			}

			// Check if payment is required BEFORE signing up
			const paymentInfo = await checkPaymentRequired({
				divisionId,
				steamId: locals.user.steamId,
				seasonId
			});

			// Create 1v1 entry
			const teamId = await signup1v1({
				ownerSteamId: locals.user.steamId,
				regionId,
				divisionId
			});

			if (paymentInfo.required && !paymentInfo.alreadyPaid) {
				// Redirect to checkout
				throw redirect(303, `/checkout/${locals.user.steamId}`);
			}

			// Redirect to user profile with success message
			throw redirect(303, `/users/${locals.user.steamId}?signup=1v1`);
		} catch (err: any) {
			// If it's a redirect, let it through
			if (err.status === 303) {
				throw err;
			}

			console.error('Error signing up for 1v1:', err);
			return fail(400, { error: err.body?.message || 'Failed to sign up for 1v1 league' });
		}
	}
};
