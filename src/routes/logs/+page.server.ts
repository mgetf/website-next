import type { PageServerLoad } from './$types';
import { listMatchLogs } from '$lib/server/services/matchLogs';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const { logs, total, totalPages } = await listMatchLogs(page);

  return {
    logs,
    pagination: {
      page,
      totalPages,
      total,
    },
  };
};
