import type { SteamItemRecord } from '$lib/types/service-models';
import { notFound, badRequest } from '$lib/server/utils/errors';

export async function getSteamItems(): Promise<SteamItemRecord[]> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return [];
  throw new Error('getSteamItems requires DATA_BACKEND=rama');
}

export async function createSteamItem(data: {
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl?: string | null;
}): Promise<SteamItemRecord> {
  void data;
  throw new Error('createSteamItem is not available under Rama');
}

export async function updateSteamItem(
  id: number,
  data: { name?: string; iconUrl?: string | null },
) {
  throw new Error('updateSteamItem is not available under Rama');
}

export async function deleteSteamItem(id: number) {
  throw new Error('deleteSteamItem is not available under Rama');
}
