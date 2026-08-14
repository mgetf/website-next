import type { PageServerLoad } from './$types';
import { getPublicServers } from '$lib/server/services/servers';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ setHeaders, url }) => {
  setHeaders({ 'cache-control': 'public, max-age=15' });

  const data = await getPublicServers();

  return {
    seo: buildPageSeo(url.origin, {
      title: 'MGE Servers | mge.tf',
      description: 'Live list of all public MGE TF2 servers — map, players, and one-click connect.',
    }),
    servers: data.servers,
    count: data.count,
    generatedAt: data.generatedAt,
    error: data.error,
  };
};
