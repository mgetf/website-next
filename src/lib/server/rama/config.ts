/**
 * Shared Rama cluster connection for SvelteKit services and E2E helpers.
 * TypeScript talks only via Rama's built-in REST JSON API.
 *
 * Uses process.env (not $env/dynamic/private) so Playwright helpers can import
 * rama clients without SvelteKit's $env virtual module.
 */

/** True when the app should use Rama (no Postgres). */
export function isRamaBackend(): boolean {
  const flag = (process.env.DATA_BACKEND ?? '').toLowerCase();
  return flag === 'rama' || flag === 'rama-rest';
}

export function getConductorUrl(): string | undefined {
  const url = process.env.RAMA_CONDUCTOR_URL;
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
  const url = process.env.RAMA_SUPERVISOR_URL;
  return url?.replace(/\/$/, '') || undefined;
}

export function ramaClientOpts() {
  return {
    conductorUrl: requireConductorUrl(),
    supervisorBaseUrl: getSupervisorBaseUrl(),
  };
}
