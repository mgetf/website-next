/**
 * Rulebook Page - Server Load
 * Fetches published rulebook content and last-updated metadata
 */

import type { PageServerLoad } from './$types';
import { getPublishedRulebook } from '$lib/server/services/siteContent';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const rulebook = await getPublishedRulebook();

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Rulebook | MGE.tf',
      description: 'Official rules and regulations for MGE.tf competitive league',
    }),
    content: rulebook.content,
    updatedAt: rulebook.updatedAt,
    version: rulebook.version,
  };
};
