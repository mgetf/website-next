export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function paypalCaptureIdFromPaymentId(paymentId: string): string {
  return paymentId.replace(/-\d+$/, '');
}

export function allocatePayPalFee(options: {
  rowGross: number;
  captureGross: number;
  captureFee: number;
  alreadyAllocatedFee: number;
  isLastRow: boolean;
}): number {
  const { rowGross, captureGross, captureFee, alreadyAllocatedFee, isLastRow } = options;
  if (rowGross <= 0 || captureFee <= 0 || captureGross <= 0) return 0;
  if (isLastRow) return roundMoney(Math.max(0, captureFee - alreadyAllocatedFee));
  const share = roundMoney((rowGross / captureGross) * captureFee);
  const remaining = roundMoney(Math.max(0, captureFee - alreadyAllocatedFee));
  return Math.min(share, remaining);
}

export function netAfterFee(gross: number, fee: number): number {
  return roundMoney(Math.max(0, gross - fee));
}
