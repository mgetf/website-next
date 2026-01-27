/**
 * Rulebook Page - Server Load
 * Fetches rulebook content from database
 */

import type { PageServerLoad } from './$types';
import {
  getContent,
  CONTENT_KEYS,
  getDefaultContent,
} from '$lib/server/services/siteContent';

export const load: PageServerLoad = async () => {
  let content = await getContent(CONTENT_KEYS.RULEBOOK);

  // If no content exists, use default
  if (!content) {
    content = getDefaultContent(CONTENT_KEYS.RULEBOOK);
  }

  return {
    content,
  };
};
