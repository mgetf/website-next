import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';

export const load: LayoutServerLoad = ({ locals }) => {
  requireAdmin(locals.user);
};
