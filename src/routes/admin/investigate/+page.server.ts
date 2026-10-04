import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getPlayerInvestigation,
  isPlayerInvestigationConfigured,
} from '$lib/server/services/playerInvestigation';
import { getPlayerProfiling } from '$lib/server/services/profiling';
import { steamId64FromAnyFormat } from '$lib/utils/steamid';
import type { ProfilingScores } from '$lib/types/profiling';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const configured = isPlayerInvestigationConfigured();
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!configured || !q) {
    return { configured, q, result: null, profiling: null };
  }

  const result = await getPlayerInvestigation(q);
  let profiling: ProfilingScores | null = null;
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
