/**
 * Environment Variable Validation
 * Centralized validation for required secrets and configuration
 * 
 * Key Environment Variables:
 * 
 * APP_ENVIRONMENT: Controls application behavior and access
 *   - 'production': Live site (mge.tf) - Full public access
 *   - 'staging': Dev site (dev.mge.tf) - Admin-only access (shows gate for non-admins)
 *   - 'development': Local development (default if not set)
 * 
 * For Railway deployment:
 *   - Production service: APP_ENVIRONMENT=production
 *   - Staging service: APP_ENVIRONMENT=staging
 */

/**
 * Required environment variables for security features
 */
const REQUIRED_SECRETS = ['JWT_SECRET', 'SESSION_SECRET'] as const;

/**
 * Optional but recommended environment variables
 */
const RECOMMENDED_VARS = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

type RequiredSecret = (typeof REQUIRED_SECRETS)[number];
type RecommendedVar = (typeof RECOMMENDED_VARS)[number];

/**
 * Cache for validated environment variables
 */
const envCache: Partial<Record<RequiredSecret | RecommendedVar, string>> = {};

/**
 * Get a required environment variable
 * Throws an error if the variable is not set
 */
export function getRequiredEnv(key: RequiredSecret): string {
  // Return cached value if available
  if (envCache[key]) {
    return envCache[key]!;
  }

  const value = process.env[key];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `This variable is required for security features. ` +
        `Please set it in your .env file or environment.`,
    );
  }

  // Validate minimum length for secrets
  if (key.includes('SECRET') && value.length < 32) {
    console.warn(
      `Warning: ${key} is shorter than recommended (32+ characters). ` +
        `Consider using a longer, more secure value.`,
    );
  }

  // Cache the value
  envCache[key] = value;
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Validate all required environment variables at startup
 * Call this early in the application lifecycle
 */
export function validateEnvironment(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required secrets
  for (const key of REQUIRED_SECRETS) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else if (key.includes('SECRET') && value.length < 32) {
      warnings.push(`${key} is shorter than recommended (32+ characters)`);
    }
  }

  // Check recommended variables
  for (const key of RECOMMENDED_VARS) {
    if (!process.env[key]) {
      warnings.push(`${key} is not set (some features may be disabled)`);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('Environment warnings:');
    warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  // Throw if missing required vars
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
        missing.map((k) => `  - ${k}`).join('\n') +
        `\n\nPlease set these in your .env file or environment before starting the application.`,
    );
  }

  console.log('Environment validation passed');
}

/**
 * Get JWT_SECRET for token signing
 */
export function getJwtSecret(): string {
  return getRequiredEnv('JWT_SECRET');
}

/**
 * Get SESSION_SECRET for cookie signing
 */
export function getSessionSecret(): string {
  return getRequiredEnv('SESSION_SECRET');
}
