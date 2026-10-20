import type { PageServerLoad } from './$types';
import { requireAuth } from '#lib/server/auth/permissions.js';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  if (params.steamId !== locals.user.steamId) {
    throw redirect(303, '/');
  }

  throw redirect(303, '/checkout');
};
