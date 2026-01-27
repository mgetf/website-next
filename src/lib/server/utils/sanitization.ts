/**
 * Input Sanitization Utilities
 * Sanitizes user input to prevent XSS and other injection attacks
 */

/**
 * Remove HTML tags from string
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(input: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Sanitize string for safe display
 * Removes HTML tags and trims whitespace
 */
export function sanitizeText(input: string): string {
  return stripHtml(input).trim();
}

/**
 * Sanitize team name
 * Allows only alphanumeric, spaces, hyphens, underscores, and periods
 */
export function sanitizeTeamName(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
    .trim()
    .substring(0, 50);
}

/**
 * Sanitize acronym
 * Allows only letters and numbers, converts to uppercase
 */
export function sanitizeAcronym(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .substring(0, 6);
}

/**
 * Sanitize URL
 * Validates and normalizes URLs
 */
export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize forum post content
 * Allows basic formatting but removes dangerous HTML
 */
export function sanitizeForumContent(input: string): string {
  // For now, strip all HTML. In the future, could allow safe tags like <b>, <i>, <code>
  return stripHtml(input).trim().substring(0, 5000);
}

/**
 * Sanitize search query
 * Removes special characters that could cause SQL injection
 * Note: Still use parameterized queries! This is defense in depth.
 */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/[%_\\]/g, '') // Remove SQL wildcards and escape char
    .trim()
    .substring(0, 100);
}

/**
 * Sanitize filename
 * Removes path traversal attempts and dangerous characters
 */
export function sanitizeFilename(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 255);
}

/**
 * Normalize whitespace
 * Replaces multiple spaces, tabs, newlines with single space
 */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return input.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitize integer input
 * Ensures value is within min/max bounds
 */
export function sanitizeInteger(
  value: number,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Sanitize FormData entries
 * Applies appropriate sanitization to all form fields
 */
export function sanitizeFormData(formData: FormData): Map<string, string> {
  const sanitized = new Map<string, string>();

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      // Apply basic HTML sanitization to all text fields
      sanitized.set(key, sanitizeText(value));
    }
  }

  return sanitized;
}
