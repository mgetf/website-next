/**
 * Steam Authentication Callback
 * GET /auth/verify - Steam redirects here after authentication
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSteamAuth } from '$lib/server/auth/steam';
import { setSession, getAndClearRedirectUrl } from '$lib/server/session';
import { prisma } from '$lib/server/db';
import { getPermissionLevel } from '$lib/server/auth/permissions';
import { BanStatus, UserRole } from '@prisma/client';

export const GET: RequestHandler = async ({ cookies, request }) => {
	try {
		// Create Steam auth instance and authenticate
		const steam = createSteamAuth(request);
		const user = await steam.authenticate(request);
		
		// Extract Steam user data
		const steamUser = user._json as any;

		// Get user's permission level from database
		const permissionLevel = await getPermissionLevel(steamUser.steamid);

		// Check if user exists in database
		const existingUser = await prisma.user.findUnique({
			where: { steamId: steamUser.steamid },
			select: {
				steamId: true,
				steamUsername: true,
				steamAvatar: true,
				permissionLevel: true,
				banStatus: true,
				nameOverride: true
			}
		});

		if (!existingUser) {
			// Create new user
			await prisma.user.create({
				data: {
					steamId: steamUser.steamid,
					steamUsername: steamUser.personaname,
					steamAvatar: steamUser.avatarfull,
					permissionLevel: UserRole.GUEST
				}
			});
		} else {
			// Update user info if not using name override
			if (
				!existingUser.nameOverride &&
				(existingUser.steamUsername !== steamUser.personaname ||
					existingUser.steamAvatar !== steamUser.avatarfull)
			) {
				await prisma.user.update({
					where: { steamId: steamUser.steamid },
					data: {
						steamUsername: steamUser.personaname,
						steamAvatar: steamUser.avatarfull
					}
				});
			}

			// Check if user is banned (non-admins only)
			if (
				existingUser.permissionLevel !== UserRole.ADMIN &&
				existingUser.banStatus !== BanStatus.NONE
			) {
				throw error(403, 'Your account has been suspended. Please contact an administrator.');
			}
		}

		// Create session
		const sessionUser = {
			steamId: steamUser.steamid,
			steamUsername: existingUser?.steamUsername ?? steamUser.personaname,
			steamAvatar: existingUser?.steamAvatar ?? steamUser.avatarfull,
			permissionLevel: existingUser?.permissionLevel ?? UserRole.GUEST,
			banStatus: existingUser?.banStatus ?? BanStatus.NONE
		};

		setSession(cookies, sessionUser as any);

		// Redirect to original page or home
		const returnUrl = getAndClearRedirectUrl(cookies);
		throw redirect(302, returnUrl);
	} catch (err) {
		console.error('Steam authentication error:', err);
		
		// If it's already a redirect or error, rethrow it
		if (err && typeof err === 'object' && ('status' in err || 'location' in err)) {
			throw err;
		}

		// Otherwise redirect to home with error
		throw redirect(302, '/?error=auth_failed');
	}
};

