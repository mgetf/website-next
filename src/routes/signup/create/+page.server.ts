import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { getSignupContext, createTeam } from '$lib/server/services/teamSignup';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import { fail, redirect } from '@sveltejs/kit';
import {
	validateUploadedFile,
	saveTempFile,
	uploadToR2,
	deleteTempFile
} from '$lib/server/utils/r2Upload';
import path from 'path';

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals.user);

	const context = await getSignupContext(locals.user.steamId);

	// Load divisions and regions
	const [divisions, regions] = await Promise.all([
		getVisibleDivisions(),
		getVisibleRegions()
	]);

	// Determine if user can create a team and why not
	let canCreate = true;
	let disabledReason = '';

	if (context.signupClosed) {
		canCreate = false;
		disabledReason = 'Team signups are currently closed';
	} else if (context.hasActiveTeam) {
		canCreate = false;
		disabledReason = 'You are already in an active 2v2 team';
	} else if (context.rosterLocked) {
		canCreate = false;
		disabledReason = 'Rosters are currently locked';
	}

	return {
		divisions,
		regions,
		canCreate,
		disabledReason
	};
};

export const actions: Actions = {
	createTeam: async ({ request, locals }) => {
		requireAuth(locals.user);

		const context = await getSignupContext(locals.user.steamId);

		// Check if signups are closed
		if (context.signupClosed) {
			return fail(400, { error: 'Signups are currently closed' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const acronym = formData.get('acronym') as string;
		const divisionId = parseInt(formData.get('divisionId') as string);
		const regionId = parseInt(formData.get('regionId') as string);
		const joinPassword = formData.get('joinPassword') as string;
		const avatar = formData.get('avatar') as File;

		// Validate required fields
		if (!name || !divisionId || !regionId || !joinPassword) {
			return fail(400, { error: 'All fields are required' });
		}

		// Handle avatar upload if provided
		let avatarUrl: string | undefined;
		let tempFilePath: string | undefined;

		if (avatar && avatar.size > 0) {
			try {
				// Validate file
				validateUploadedFile(avatar);

				// Save temporarily
				tempFilePath = await saveTempFile(avatar);

				// Upload to R2 (returns null if R2 not configured)
				const ext = path.extname(avatar.name);
				const remotePath = `team-avatars/${Date.now()}${ext}`;
				const uploadResult = await uploadToR2(tempFilePath, remotePath);
				
				if (uploadResult) {
					avatarUrl = uploadResult;
				} else {
					// R2 not configured, skip avatar upload
					console.warn('Avatar upload skipped - R2 not configured');
				}

				// Delete temp file
				deleteTempFile(tempFilePath);
			} catch (err: any) {
				if (tempFilePath) {
					deleteTempFile(tempFilePath);
				}
				return fail(400, { error: err.message || 'Failed to upload avatar' });
			}
		}

		try {
			// Get the correct season ID for the selected region
			let seasonId: number | undefined;
			switch (regionId) {
				case 1: seasonId = context.naSignupSeasonId ?? undefined; break;
				case 2: seasonId = context.euSignupSeasonId ?? undefined; break;
				case 3: seasonId = context.ausSignupSeasonId ?? undefined; break;
				case 4: seasonId = context.saSignupSeasonId ?? undefined; break;
				case 5: seasonId = context.asiaSignupSeasonId ?? undefined; break;
			}

			// Check if payment is required BEFORE creating the team
			const paymentInfo = await checkPaymentRequired({
				divisionId,
				steamId: locals.user.steamId,
				seasonId
			});

			// Create team
			const teamId = await createTeam({
				name,
				acronym: acronym || undefined,
				avatar: avatarUrl,
				divisionId,
				regionId,
				joinPassword,
				ownerSteamId: locals.user.steamId
			});

			if (paymentInfo.required && !paymentInfo.alreadyPaid) {
				// Redirect to checkout
				throw redirect(303, `/checkout/${locals.user.steamId}`);
			}

			// Redirect to team page
			throw redirect(303, `/teams/${teamId}`);
		} catch (err: any) {
			// If it's a redirect, let it through
			if (err.status === 303) {
				throw err;
			}

			console.error('Error creating team:', err);
			return fail(400, { error: err.body?.message || 'Failed to create team' });
		}
	}
};

