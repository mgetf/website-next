import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';

export const load: LayoutServerLoad = ({ locals }) => {
  requireAdmin(locals.user);
};
