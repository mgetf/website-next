const TOKEN = /^[A-Za-z0-9_-]+$/;

export function canonicalTradeOfferUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com') return null;
  const path = url.pathname.replace(/\/$/, '');
  if (path !== '/tradeoffer/new') return null;

  const partner = url.searchParams.get('partner') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!/^\d+$/.test(partner) || !TOKEN.test(token)) return null;

  return `https://steamcommunity.com/tradeoffer/new/?partner=${partner}&token=${token}`;
}
