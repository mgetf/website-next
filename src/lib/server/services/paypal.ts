/**
 * PayPal Service
 *
 * Handles PayPal API authentication and common operations.
 * All PayPal-related business logic goes here.
 *
 * TEST MODE: Set PAYPAL_MODE=test to enable mock payments for local development ONLY.
 * Test mode is refused outside APP_ENVIRONMENT=development so staging/prod cannot
 * accidentally accept free mock captures.
 */

import { getOptionalEnv } from '$lib/server/utils/env';
import { getAppEnvironment } from '$lib/server/utils/environment';

// Cached access token
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Check if we're in test/mock mode.
 * Only honored when APP_ENVIRONMENT is development.
 */
export function isPayPalTestMode(): boolean {
  return getOptionalEnv('PAYPAL_MODE') === 'test' && getAppEnvironment() === 'development';
}

/**
 * True when PAYPAL_MODE=test was set outside local development (misconfiguration).
 */
export function isPayPalTestModeMisconfigured(): boolean {
  return getOptionalEnv('PAYPAL_MODE') === 'test' && getAppEnvironment() !== 'development';
}

/**
 * Get PayPal API configuration
 */
export function getPayPalConfig() {
  const mode = getOptionalEnv('PAYPAL_MODE', 'sandbox');
  const clientId = getOptionalEnv('PAYPAL_CLIENT_ID');
  const clientSecret = getOptionalEnv('PAYPAL_CLIENT_SECRET');
  const isTestMode = isPayPalTestMode();

  // If someone set test mode outside development, fall through to sandbox/live
  // API paths but callers should reject via isPayPalTestModeMisconfigured().
  const effectiveMode = isTestMode ? 'test' : mode === 'test' ? 'sandbox' : mode;
  const apiBase =
    effectiveMode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  return {
    mode: effectiveMode,
    clientId,
    clientSecret,
    apiBase,
    isTestMode,
  };
}

/**
 * Validate PayPal credentials are configured
 */
export function validatePayPalCredentials(): {
  valid: boolean;
  error?: string;
} {
  const config = getPayPalConfig();

  if (!config.clientId) {
    return { valid: false, error: 'PAYPAL_CLIENT_ID is not configured' };
  }

  if (!config.clientSecret) {
    return { valid: false, error: 'PAYPAL_CLIENT_SECRET is not configured' };
  }

  return { valid: true };
}

/**
 * Get PayPal access token with caching
 * Tokens are cached until they expire to avoid unnecessary API calls
 */
export async function getPayPalAccessToken(): Promise<{
  token: string | null;
  error?: string;
}> {
  const config = getPayPalConfig();

  // Validate credentials first
  const validation = validatePayPalCredentials();
  if (!validation.valid) {
    return { token: null, error: validation.error };
  }

  // Check if we have a valid cached token
  if (cachedToken && Date.now() < tokenExpiry) {
    return { token: cachedToken };
  }

  try {
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        token: null,
        error: data.error_description || data.error || 'Failed to get access token',
      };
    }

    if (!data.access_token) {
      return { token: null, error: 'No access token in PayPal response' };
    }

    // Cache the token (expire 5 minutes early to be safe)
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    return { token: data.access_token };
  } catch (err) {
    return { token: null, error: 'Network error fetching PayPal access token' };
  }
}

/**
 * Clear cached token (useful for testing or after errors)
 */
export function clearPayPalTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Create a PayPal order
 * In test mode, returns a mock order without calling PayPal
 */
export async function createPayPalOrder(params: {
  amount: number;
  currency: string;
  steamId: string;
  teamId: number;
  customId?: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ success: boolean; order?: any; error?: string }> {
  const { amount, currency, steamId, teamId, customId, returnUrl, cancelUrl } = params;
  const resolvedCustomId = customId ?? `${steamId}|${teamId}`;

  if (isPayPalTestModeMisconfigured()) {
    return {
      success: false,
      error: 'PayPal test mode is only allowed in local development',
    };
  }

  const config = getPayPalConfig();

  // TEST MODE: Return mock order (development only)
  if (config.isTestMode) {
    const mockOrderId = `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
      success: true,
      order: {
        id: mockOrderId,
        status: 'CREATED',
        links: [
          {
            rel: 'self',
            href: `https://test.paypal.com/orders/${mockOrderId}`,
          },
          {
            rel: 'approve',
            href: `https://test.paypal.com/approve/${mockOrderId}`,
          },
        ],
      },
    };
  }

  // Get access token
  const tokenResult = await getPayPalAccessToken();
  if (!tokenResult.token) {
    return {
      success: false,
      error: tokenResult.error || 'Failed to get access token',
    };
  }

  try {
    const response = await fetch(`${config.apiBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
            description: `MGE.tf Team Signup - Team #${teamId}`,
            custom_id: resolvedCustomId,
          },
        ],
        application_context: {
          brand_name: 'MGE.tf',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const order = await response.json();

    if (!response.ok) {
      // If token was invalid, clear cache and suggest retry
      if (order.error === 'invalid_token') {
        clearPayPalTokenCache();
      }

      // Sanitize error message - only return safe, generic messages
      // Never expose internal PayPal API details or sensitive information
      const paypalError = order.message || order.error_description || '';
      const sanitizedError =
        paypalError.includes('authentication') || paypalError.includes('credential')
          ? 'Authentication failed'
          : paypalError.includes('invalid')
            ? 'Invalid request'
            : 'Failed to create PayPal order';

      return {
        success: false,
        error: sanitizedError,
      };
    }

    return { success: true, order };
  } catch (err) {
    return { success: false, error: 'Network error creating PayPal order' };
  }
}

/**
 * Capture a PayPal order (complete payment)
 * In test mode, returns mock capture data without calling PayPal
 */
export async function capturePayPalOrder(
  orderID: string,
  testData?: {
    steamId: string;
    teamId: number;
    amount: number;
    currency: string;
  },
): Promise<{ success: boolean; captureData?: any; error?: string }> {
  if (isPayPalTestModeMisconfigured()) {
    return {
      success: false,
      error: 'PayPal test mode is only allowed in local development',
    };
  }

  const config = getPayPalConfig();

  // TEST MODE: Return mock capture response (development only)
  if (config.isTestMode) {
    if (!testData) {
      return { success: false, error: 'Test mode requires testData parameter' };
    }

    const mockCaptureId = `TEST-CAPTURE-${Date.now()}`;
    return {
      success: true,
      captureData: {
        id: orderID,
        status: 'COMPLETED',
        purchase_units: [
          {
            custom_id: `${testData.steamId}|${testData.teamId}`,
            payments: {
              captures: [
                {
                  id: mockCaptureId,
                  status: 'COMPLETED',
                  amount: {
                    currency_code: testData.currency,
                    value: testData.amount.toFixed(2),
                  },
                },
              ],
            },
          },
        ],
      },
    };
  }

  // Get access token
  const tokenResult = await getPayPalAccessToken();
  if (!tokenResult.token) {
    return {
      success: false,
      error: tokenResult.error || 'Failed to get access token',
    };
  }

  try {
    const response = await fetch(`${config.apiBase}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.token}`,
      },
    });

    const captureData = await response.json();

    if (!response.ok) {
      // If token was invalid, clear cache
      if (captureData.error === 'invalid_token') {
        clearPayPalTokenCache();
      }

      // Sanitize error message - only return safe, generic messages
      // Never expose internal PayPal API details or sensitive information
      const paypalError = captureData.message || captureData.error_description || '';
      const sanitizedError =
        paypalError.includes('authentication') || paypalError.includes('credential')
          ? 'Authentication failed'
          : paypalError.includes('invalid')
            ? 'Invalid request'
            : 'Failed to capture payment';

      return {
        success: false,
        error: sanitizedError,
      };
    }

    return { success: true, captureData };
  } catch (err) {
    return { success: false, error: 'Network error capturing PayPal order' };
  }
}
