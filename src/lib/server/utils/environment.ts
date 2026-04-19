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
export const UNGATED_ROUTES = ['/auth/login', '/auth/verify', '/auth/logout'] as const;

/**
 * Check if a route should bypass the dev gate
 */
export function isUngatedRoute(pathname: string): boolean {
  return UNGATED_ROUTES.some((route) => pathname.startsWith(route));
}
