import { redirect } from '@sveltejs/kit';
import { requireAuth, isAdmin } from '$lib/server/auth/permissions';
import { getUserPaymentHistory } from '$lib/server/services/payments';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAuth(locals.user);

  const { steamId } = params;

  if (steamId !== locals.user!.steamId && !isAdmin(locals.user)) {
    throw redirect(303, `/users/${steamId}`);
  }

  const pageParam = url.searchParams.get('page');
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const limit = 20;

  const { entries, total } = await getUserPaymentHistory(steamId, currentPage, limit);

  return {
    entries: entries.map((e) => ({
      ...e,
      date: e.date.toISOString(),
    })),
    total,
    currentPage,
    totalPages: Math.ceil(total / limit),
    steamId,
  };
};
