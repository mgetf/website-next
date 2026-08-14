import type { PageServerLoad } from './$types';
import { getEventById, getEventBracketData } from '$lib/server/services/events';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ params, url }) => {
  const id = parseInt(params.id);
  const event = await getEventById(id);

  const brackets = await Promise.all(
    event.stages.map(async (stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      data: await getEventBracketData(stage.id),
    })),
  );

  const typeLabel =
    event.type === 'FIGHT_NIGHT'
      ? 'Fight Night'
      : event.type === 'CHAMPIONSHIP'
        ? 'World Championship'
        : event.type === 'CUP'
          ? event.isTeamEvent
            ? '2v2 Cup'
            : '1v1 Cup'
          : 'Tournament';

  return {
    seo: buildPageSeo(url.origin, {
      title: `${event.name} | MGE.tf`,
      description: event.description?.trim()
        ? event.description.trim().slice(0, 200)
        : `${event.name} — ${typeLabel} on MGE.tf`,
      image: event.avatar ?? null,
      imageAlt: event.name,
      card: 'summary',
      type: 'website',
    }),
    event,
    brackets,
  };
};
