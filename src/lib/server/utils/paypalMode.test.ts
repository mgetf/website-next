import { afterEach, describe, expect, it } from 'vitest';
import { isPayPalTestMode, isPayPalTestModeMisconfigured } from '../services/paypal';

const ORIGINAL_PAYPAL_MODE = process.env.PAYPAL_MODE;
const ORIGINAL_APP_ENV = process.env.APP_ENVIRONMENT;

afterEach(() => {
  if (ORIGINAL_PAYPAL_MODE === undefined) delete process.env.PAYPAL_MODE;
  else process.env.PAYPAL_MODE = ORIGINAL_PAYPAL_MODE;

  if (ORIGINAL_APP_ENV === undefined) delete process.env.APP_ENVIRONMENT;
  else process.env.APP_ENVIRONMENT = ORIGINAL_APP_ENV;
});

describe('PayPal test mode gating', () => {
  it('allows test mode only in development', () => {
    process.env.PAYPAL_MODE = 'test';
    process.env.APP_ENVIRONMENT = 'development';
    expect(isPayPalTestMode()).toBe(true);
    expect(isPayPalTestModeMisconfigured()).toBe(false);
  });

  it('treats test mode as misconfigured in staging/production', () => {
    process.env.PAYPAL_MODE = 'test';
    process.env.APP_ENVIRONMENT = 'staging';
    expect(isPayPalTestMode()).toBe(false);
    expect(isPayPalTestModeMisconfigured()).toBe(true);

    process.env.APP_ENVIRONMENT = 'production';
    expect(isPayPalTestMode()).toBe(false);
    expect(isPayPalTestModeMisconfigured()).toBe(true);
  });

  it('is inactive when PAYPAL_MODE is sandbox/live', () => {
    process.env.PAYPAL_MODE = 'sandbox';
    process.env.APP_ENVIRONMENT = 'development';
    expect(isPayPalTestMode()).toBe(false);
    expect(isPayPalTestModeMisconfigured()).toBe(false);
  });
});
