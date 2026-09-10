import { describe, expect, it } from 'vitest';
import { isFreeDivision, needsFreeDivisionAcknowledgment } from './signupDivision';

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

describe('needsFreeDivisionAcknowledgment', () => {
  it('is false when nothing is selected', () => {
    expect(needsFreeDivisionAcknowledgment(null, [0, 10])).toBe(false);
    expect(needsFreeDivisionAcknowledgment(undefined, [0, 10])).toBe(false);
  });

  it('is false when the selected division is paid', () => {
    expect(needsFreeDivisionAcknowledgment(10, [0, 10])).toBe(false);
  });

  it('is false when every visible division is free', () => {
    expect(needsFreeDivisionAcknowledgment(0, [0, 0])).toBe(false);
  });

  it('is true when a free division is selected and a paid option exists', () => {
    expect(needsFreeDivisionAcknowledgment(0, [0, 10])).toBe(true);
  });
});
