import type { PageServerLoad } from './$types';
import { getMapFiles } from '$lib/server/services/mapFiles';

export const load: PageServerLoad = async () => {
  const maps = await getMapFiles();

  return {
    maps: maps.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      bspSizeBytes: Number(m.bspSize),
      cfgSizeBytes: Number(m.cfgSize),
      createdAt: m.createdAt.toISOString(),
    })),
  };
};
