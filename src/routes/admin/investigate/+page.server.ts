import type { PageServerLoad } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import {
  getPlayerInvestigation,
  isPlayerInvestigationConfigured,
} from '#lib/server/services/playerInvestigation.js';
import { getPlayerProfiling } from '#lib/server/services/profiling.js';
import { steamId64FromAnyFormat } from '#lib/utils/steamid.js';
import type { ProfilingSnapshot } from '#lib/types/profiling.js';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const configured = isPlayerInvestigationConfigured();
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!configured || !q) {
    return { configured, q, result: null, profiling: null };
  }

  const result = await getPlayerInvestigation(q);
  let profiling: ProfilingSnapshot | null = null;
  if (result.kind === 'steam' || result.kind === 'not-found') {
    const steamId = result.steam64 ?? steamId64FromAnyFormat(result.steamId);
    if (steamId) {
      try {
        profiling = await getPlayerProfiling(steamId, {
          investigation: result.kind === 'steam' ? result : undefined,
        });
      } catch {
        profiling = null;
      }
    }
  }

  return { configured, q, result, profiling };
};
