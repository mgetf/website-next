/**
 * PostHog Analytics Utilities
 * Client-side analytics tracking
 */

import type { SessionUser } from '$lib/types/user';

declare global {
  interface Window {
    posthog?: {
      identify: (id: string, properties?: Record<string, unknown>) => void;
      capture: (event: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
    };
  }
}

/**
 * Identify user to PostHog
 * Should be called when user logs in or on page load if authenticated
 */
export function identifyUser(user: SessionUser): void {
  if (typeof window === 'undefined' || !window.posthog) return;

  window.posthog.identify(user.steamId, {
    username: user.steamUsername,
    permissionLevel: user.permissionLevel,
  });
}

/**
 * Reset PostHog identity
 * Should be called when user logs out
 */
export function resetIdentity(): void {
  if (typeof window === 'undefined' || !window.posthog) return;

  window.posthog.reset();
}

/**
 * Track custom event
 */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !window.posthog) return;

  window.posthog.capture(event, properties);
}
