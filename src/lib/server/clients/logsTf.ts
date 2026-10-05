const LOGS_TF_TIMEOUT_MS = 4000;

export function parseLogsTfTotal(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const total = (data as { total?: unknown }).total;
  if (typeof total === 'number' && Number.isFinite(total)) return total;
  const results = (data as { results?: unknown }).results;
  if (typeof results === 'number' && Number.isFinite(results)) return results;
  return null;
}

export async function fetchLogsTfTotalCount(steamId: string): Promise<number | null> {
  try {
    const url = `https://logs.tf/api/v1/log?player=${encodeURIComponent(steamId)}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGS_TF_TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseLogsTfTotal(await res.json());
  } catch {
    return null;
  }
}
