/**
 * Steam login URL that returns the visitor to a signup destination.
 */
export function loginToParticipateHref(destination: string): string {
  return `/auth/login?redirect=${encodeURIComponent(destination)}`;
}
