/**
 * Rulebook Page - Server Load
 * Fetches rulebook content from database
 */

import type { PageServerLoad } from './$types';
import { getContent, CONTENT_KEYS, getDefaultContent } from '$lib/server/services/siteContent';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  let content = await getContent(CONTENT_KEYS.RULEBOOK);

  // If no content exists, use default
  if (!content) {
    content = getDefaultContent(CONTENT_KEYS.RULEBOOK);
  }

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Rulebook | MGE.tf',
      description: 'Official rules and regulations for MGE.tf competitive league',
    }),
    content,
  };
};
