/**
 * Admin Layout Server Load
 * Requires admin/moderator permissions to access any admin route
 */

import type { LayoutServerLoad } from './$types';
import { requireAdmin, isStrictAdmin } from '$lib/server/auth/permissions';

export const load: LayoutServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  return {
    user: locals.user,
    isStrictAdmin: isStrictAdmin(locals.user),
  };
};
