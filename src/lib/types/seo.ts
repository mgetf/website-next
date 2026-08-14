/**
 * Page SEO / Open Graph metadata returned from load functions.
 * Rendered once in the root layout so Discord/crawlers see a single set of tags.
 */
export interface PageSeo {
  /** Browser tab + og:title */
  title: string;
  /** meta description + og:description */
  description: string;
  /** Absolute HTTPS image URL for og:image (avatar, logo, etc.) */
  image?: string | null;
  /** Alt text for the preview image */
  imageAlt?: string | null;
  /**
   * Twitter/Discord card layout.
   * Use `summary` for square avatars; `summary_large_image` for wide banners.
   */
  card?: 'summary' | 'summary_large_image';
  /** og:type — defaults to website */
  type?: 'website' | 'profile' | 'article';
}
