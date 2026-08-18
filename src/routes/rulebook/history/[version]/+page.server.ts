import type { PageServerLoad } from './$types';
import { getRulebookRevision } from '$lib/server/services/siteContent';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ params, url }) => {
  const version = Number(params.version);
  const revision = await getRulebookRevision(version);

  return {
    seo: buildPageSeo(url.origin, {
      title: `Rulebook revision ${revision.version} | MGE.tf`,
      description: revision.message,
    }),
    revision,
  };
};
