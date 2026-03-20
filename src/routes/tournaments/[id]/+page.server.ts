import type { PageServerLoad } from './$types';
import { getEventById, getEventBracketData } from '$lib/server/services/events';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id);
  const event = await getEventById(id);

  const brackets = await Promise.all(
    event.stages.map(async (stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      data: await getEventBracketData(stage.id),
    })),
  );

  return { event, brackets };
};
