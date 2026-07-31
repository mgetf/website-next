/**
 * Shared Rama cluster connection for SvelteKit services.
 * TypeScript talks only via Rama's built-in REST JSON API.
 */

import { env } from '$env/dynamic/private';

/** True when the app should use Rama (no Postgres). */
export function isRamaBackend(): boolean {
  const flag = (env.DATA_BACKEND ?? process.env.DATA_BACKEND ?? '').toLowerCase();
  return flag === 'rama' || flag === 'rama-rest';
}

export function getConductorUrl(): string | undefined {
  const url = env.RAMA_CONDUCTOR_URL ?? process.env.RAMA_CONDUCTOR_URL;
  return url?.replace(/\/$/, '') || undefined;
}

export function requireConductorUrl(): string {
  const url = getConductorUrl();
  if (!url) {
    throw new Error('RAMA_CONDUCTOR_URL is required when DATA_BACKEND=rama');
  }
  return url;
}

export function getSupervisorBaseUrl(): string | undefined {
  const url = env.RAMA_SUPERVISOR_URL ?? process.env.RAMA_SUPERVISOR_URL;
  return url?.replace(/\/$/, '') || undefined;
}

export function ramaClientOpts() {
  return {
    conductorUrl: requireConductorUrl(),
    supervisorBaseUrl: getSupervisorBaseUrl(),
  };
}
