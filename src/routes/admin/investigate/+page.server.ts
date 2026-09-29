import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getPlayerInvestigation,
  isPlayerInvestigationConfigured,
} from '$lib/server/services/playerInvestigation';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const configured = isPlayerInvestigationConfigured();
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!configured || !q) {
    return { configured, q, result: null };
  }

  const result = await getPlayerInvestigation(q);
  return { configured, q, result };
};
