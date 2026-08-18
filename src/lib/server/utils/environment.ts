/**
 * Environment Detection Utilities
 * Handles detection of deployment environment (production, staging, development)
 */

/**
 * Possible deployment environments
 */
export type AppEnvironment = 'production' | 'staging' | 'development';

/**
 * Get the current application environment
 *
 * Set APP_ENVIRONMENT in Railway/Docker:
 * - 'production' - Live site (mge.tf)
 * - 'staging' - Dev/preview site (dev.mge.tf) - Admin-only access
 * - 'development' - Local development
 *
 * Falls back to 'development' if not set
 */
export function getAppEnvironment(): AppEnvironment {
  const env = process.env.APP_ENVIRONMENT?.toLowerCase();

  if (env === 'production' || env === 'staging' || env === 'development') {
    return env;
  }

  // Default to development if not set or invalid
  return 'development';
}

/**
 * Check if the app is running in staging/preview mode
 * Staging mode restricts access to admins only
 */
export function isStaging(): boolean {
  return getAppEnvironment() === 'staging';
}

/**
 * Routes that should be accessible even when the site is gated
 * (needed for login flow to work)
 */
export const UNGATED_ROUTES = [
  '/auth/login',
  '/auth/verify',
  '/auth/logout',
  '/auth/test-login',
] as const;

/**
 * Check if a route should bypass the dev gate
 */
export function isUngatedRoute(pathname: string): boolean {
  return UNGATED_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Known link-preview crawlers (Discord, Slack, etc.).
 * Staging gates non-admins, but these bots must reach public pages to
 * scrape Open Graph tags — otherwise embeds show the DevGate homepage.
 */
const LINK_PREVIEW_CRAWLER_RE =
  /Discordbot|Slackbot|Twitterbot|facebookexternalhit|Facebot|LinkedInBot|TelegramBot|WhatsApp|Iframely|Embedly|SkypeUriPreview|vkShare|Pinterestbot|Redditbot/i;

/**
 * True when the request User-Agent is a social/link-preview crawler.
 */
export function isLinkPreviewCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return LINK_PREVIEW_CRAWLER_RE.test(userAgent);
}

/**
 * Staging-gate bypass for link-preview crawlers on public page reads.
 * Never opens APIs, admin, or non-GET traffic.
 */
export function shouldBypassStagingGateForCrawler(
  userAgent: string | null,
  method: string,
  pathname: string,
): boolean {
  const upper = method.toUpperCase();
  if (upper !== 'GET' && upper !== 'HEAD' && upper !== 'OPTIONS') return false;
  if (pathname.startsWith('/api/') || pathname.startsWith('/admin')) return false;
  return isLinkPreviewCrawler(userAgent);
}
