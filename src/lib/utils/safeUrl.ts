/**
 * URL safety helpers shared by client markdown rendering and server validation.
 */

/**
 * Returns true when a URL is safe to use in href/src attributes.
 * Allows http(s), mailto, relative paths, and same-document hashes.
 * Blocks javascript:, data:, vbscript:, and protocol-relative URLs.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Same-document / relative paths (not protocol-relative)
  if (trimmed.startsWith('#') || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
    return true;
  }

  // Protocol-relative is an open redirect / mixed-content footgun
  if (trimmed.startsWith('//')) return false;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}
