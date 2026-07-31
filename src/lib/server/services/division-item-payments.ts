export async function upsertDivisionItemPayment(
  divisionId: number,
  data: { steamItemId: number; itemQuantity: number },
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Division item payments are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('upsertDivisionItemPayment requires DATA_BACKEND=rama');
}

export async function deleteDivisionItemPayment(divisionId: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void divisionId;
    return { count: 0 };
  }
  throw new Error('deleteDivisionItemPayment requires DATA_BACKEND=rama');
}
