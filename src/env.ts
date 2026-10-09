import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

function optional(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function required(name: string) {
  return (value: string | undefined): string => {
    if (building) return value ?? '';
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };
}

/**
 * Explicit environment variables for SvelteKit 3 (`$app/env/private` and `$app/env/public`).
 * Secrets stay private; only values marked `public: true` can be imported in the browser.
 */
export const variables = defineEnvVars({
  JWT_SECRET: {
    description: 'HMAC secret for JWT signing (32+ characters)',
    schema: required('JWT_SECRET'),
  },
  SESSION_SECRET: {
    description: 'HMAC secret for signed session cookies (32+ characters)',
    schema: required('SESSION_SECRET'),
  },
  STEAM_API_KEY: {
    description: 'Steam Web API key for OpenID and player summaries',
    schema: optional,
  },
  DISCORD_CLIENT_ID: {
    description: 'Discord OAuth application client ID',
    schema: optional,
  },
  DISCORD_CLIENT_SECRET: {
    description: 'Discord OAuth application client secret',
    schema: optional,
  },
  DISCORD_REDIRECT_URI: {
    description:
      'Optional Discord OAuth redirect override; defaults to {origin}/auth/discord/callback',
    schema: optional,
  },
  MGE_PLATFORM_URL: {
    description: 'MGE platform API origin (ratings, leaderboard, investigate)',
    schema: optional,
  },
  MGE_PANEL_URL: {
    description: 'Game server panel public API origin',
    schema: optional,
  },
  PUBLIC_URL: {
    description: 'Public site origin used for Steam OpenID, PayPal returns, and CSRF',
    schema: optional,
  },
});
