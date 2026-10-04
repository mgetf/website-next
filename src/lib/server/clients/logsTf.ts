const LOGS_TF_TIMEOUT_MS = 4000;

export async function fetchLogsTfRecentCount(steamId: string): Promise<number | null> {
  try {
    const url = `https://logs.tf/api/v1/log?player=${encodeURIComponent(steamId)}&limit=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGS_TF_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: number; logs?: unknown[] };
    if (typeof data.results === 'number' && Number.isFinite(data.results)) return data.results;
    if (Array.isArray(data.logs)) return data.logs.length;
    return null;
  } catch {
    return null;
  }
}
