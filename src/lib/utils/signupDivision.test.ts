import { describe, expect, it } from 'vitest';
import { isFreeDivision } from './signupDivision';

describe('isFreeDivision', () => {
  it('treats zero and negative costs as free', () => {
    expect(isFreeDivision(0)).toBe(true);
    expect(isFreeDivision(-1)).toBe(true);
  });

  it('treats any positive cost as paid', () => {
    expect(isFreeDivision(0.01)).toBe(false);
    expect(isFreeDivision(10)).toBe(false);
  });
});
