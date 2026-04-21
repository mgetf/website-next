import type { PageServerLoad } from './$types';
import { getPublicServers } from '$lib/server/services/servers';

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({ 'cache-control': 'public, max-age=15' });

  const data = await getPublicServers();

  return {
    servers: data.servers,
    count: data.count,
    generatedAt: data.generatedAt,
    error: data.error,
  };
};
