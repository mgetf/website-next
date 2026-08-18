import type { PageServerLoad } from './$types';
import { listRulebookRevisions } from '$lib/server/services/siteContent';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const revisions = await listRulebookRevisions();

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Rulebook history | MGE.tf',
      description: 'Public history of MGE.tf rulebook changes',
    }),
    revisions,
  };
};
