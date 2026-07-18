import type { PageServerLoad } from './$types';
import { getAllEvents } from '$lib/server/services/events';

export const load: PageServerLoad = async () => {
  const events = await getAllEvents();

  return { events };
};
