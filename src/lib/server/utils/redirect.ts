/**
 * Post-login redirect sanitization.
 * Pure helper kept free of cookie/env dependencies for unit testing.
 */

/**
 * Rejects absolute URLs, protocol-relative URLs, backslash tricks, and
 * embedded control characters that could be used for an open redirect.
 * Falls back to '/' for anything that doesn't look like a safe relative path.
 */
export function sanitizeRedirectUrl(raw: string | null | undefined): string {
  if (!raw) return '/';

  // Reject control characters (including newlines, which can smuggle headers)
  if (/[\x00-\x1f]/.test(raw)) return '/';

  // Must start with a single '/' and not be protocol-relative ('//...')
  // or use a backslash to trick browsers into treating it as protocol-relative.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }

  // Belt-and-suspenders: reject if it parses as an absolute URL with a different origin.
  try {
    const parsed = new URL(raw, 'https://mge.tf');
    if (parsed.origin !== 'https://mge.tf') return '/';
  } catch {
    return '/';
  }

  return raw;
}
