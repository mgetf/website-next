/**
 * Admin Layout Server Load
 * Requires admin/moderator permissions to access any admin route
 */

import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Require admin or moderator access
  requireAdmin(locals.user);

  return {
    user: locals.user,
  };
};
