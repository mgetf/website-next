import { describe, expect, it } from 'vitest';
import {
  allocatePayPalFee,
  netAfterFee,
  paypalCaptureIdFromPaymentId,
  roundMoney,
} from './paypalRefundMath';

describe('paypal refund math', () => {
  it('strips the per-player suffix from a stored payment id', () => {
    expect(paypalCaptureIdFromPaymentId('7TK53561YB803214S-0')).toBe('7TK53561YB803214S');
    expect(paypalCaptureIdFromPaymentId('TEST-CAPTURE-1710000000000-2')).toBe(
      'TEST-CAPTURE-1710000000000',
    );
  });

  it('splits one capture fee across players and gives the last row the remainder', () => {
    const captureGross = 20;
    const captureFee = 1.19;
    const first = allocatePayPalFee({
      rowGross: 10,
      captureGross,
      captureFee,
      alreadyAllocatedFee: 0,
      isLastRow: false,
    });
    const second = allocatePayPalFee({
      rowGross: 10,
      captureGross,
      captureFee,
      alreadyAllocatedFee: first,
      isLastRow: true,
    });
    expect(roundMoney(first + second)).toBe(captureFee);
    expect(roundMoney(netAfterFee(10, first) + netAfterFee(10, second))).toBe(
      roundMoney(20 - captureFee),
    );
  });

  it('does not charge a fee when PayPal charged none', () => {
    expect(
      allocatePayPalFee({
        rowGross: 10,
        captureGross: 10,
        captureFee: 0,
        alreadyAllocatedFee: 0,
        isLastRow: true,
      }),
    ).toBe(0);
    expect(netAfterFee(10, 0)).toBe(10);
  });
});
