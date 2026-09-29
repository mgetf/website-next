import { getPlayerChatHistory } from '$lib/server/clients/mgePlatform';
import type { ChatWindow, ProfileChatPage } from '$lib/types/profile';

const DAY_SECONDS = 86400;

export function parseChatWindow(raw: string | null): ChatWindow | null {
  if (raw == null || raw === '' || raw === 'all') return 'all';
  if (raw === '7' || raw === '30' || raw === '90') return raw;
  return null;
}

export async function getStaffPlayerChat(
  steamId64: string,
  opts: { region: string; window: ChatWindow; cursor?: number },
): Promise<ProfileChatPage | null> {
  const from =
    opts.window === 'all'
      ? undefined
      : Math.floor(Date.now() / 1000) - Number(opts.window) * DAY_SECONDS;
  return getPlayerChatHistory(steamId64, {
    region: opts.region && opts.region !== 'all' ? opts.region : undefined,
    from,
    cursor: opts.cursor,
    limit: 50,
  });
}
