import type { PageSeo } from '$lib/types/seo';

export const DEFAULT_SEO_DESCRIPTION =
  'MGE.tf is a competitive Team Fortress 2 MGE league platform for 2v2 tournaments and seasonal play';

export const DEFAULT_SEO_IMAGE_PATH = '/apple-touch-icon.png';

/**
 * Resolve a possibly-relative image/path against the request origin.
 * Returns null for empty or invalid values.
 */
export function toAbsoluteUrl(pathOrUrl: string | null | undefined, origin: string): string | null {
  if (!pathOrUrl?.trim()) return null;
  try {
    return new URL(pathOrUrl.trim(), origin).href;
  } catch {
    return null;
  }
}

/**
 * Build a PageSeo object with absolute image URL for Discord/OG previews.
 */
export function buildPageSeo(
  origin: string,
  options: {
    title: string;
    description: string;
    image?: string | null;
    imageAlt?: string | null;
    card?: PageSeo['card'];
    type?: PageSeo['type'];
  },
): PageSeo {
  return {
    title: options.title,
    description: options.description,
    image: toAbsoluteUrl(options.image, origin),
    imageAlt: options.imageAlt ?? null,
    card: options.card ?? (options.image ? 'summary' : 'summary_large_image'),
    type: options.type ?? 'website',
  };
}
