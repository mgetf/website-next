import { describe, expect, it } from 'vitest';
import { CART_HOLD_MS } from './cart';

describe('cart reservation window', () => {
  it('holds a participation for 30 minutes', () => {
    expect(CART_HOLD_MS).toBe(30 * 60 * 1000);
  });
});
