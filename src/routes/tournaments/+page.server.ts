import type { PageServerLoad } from './$types';
import { getAllEvents } from '$lib/server/services/events';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const events = await getAllEvents();

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Tournaments | MGE.tf',
      description:
        'Browse all MGE.tf tournaments including Cups, World Championships, and Fight Night events',
    }),
    events,
  };
};
