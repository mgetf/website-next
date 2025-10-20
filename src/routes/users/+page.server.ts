import type { PageServerLoad } from './$types';
import { getUsersPublic } from '$lib/server/services/users';

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1');
	const search = url.searchParams.get('search') || undefined;
	const role = url.searchParams.get('role') || undefined;

	const { users, pagination } = await getUsersPublic(page, search, role);

	return {
		users,
		pagination,
		filters: {
			search: search || '',
			role: role || ''
		}
	};
};

