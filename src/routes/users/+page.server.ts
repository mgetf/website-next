import type { PageServerLoad } from './$types';
import { getUsersPublic } from '$lib/server/services/users';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const search = url.searchParams.get('search') || undefined;
  const role = url.searchParams.get('role') || undefined;

  const { users, pagination } = await getUsersPublic(page, search, role);

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Users | MGE.tf',
      description: 'Browse all MGE.tf users and players',
    }),
    users,
    pagination,
    filters: {
      search: search || '',
      role: role || '',
    },
  };
};
