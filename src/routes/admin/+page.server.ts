import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// TODO: Remove this redirect once proper dashboard is implemented
	redirect(308, '/admin/league');
};

