/**
 * Repair UTF-8 text that was decoded as Latin-1 (e.g. "SÃ£o Paulo" → "São Paulo").
 * Leaves already-correct Unicode alone.
 */
export function repairUtf8Mojibake(value: string): string {
  if (!/[\u00C2\u00C3]/.test(value)) return value;

  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) return value;
    bytes[i] = code;
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!decoded || decoded.includes('\uFFFD')) return value;
    return decoded;
  } catch {
    return value;
  }
}
