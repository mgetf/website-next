import { prisma } from '$lib/server/db';

export async function upsertDivisionItemPayment(
  divisionId: number,
  data: { steamItemId: number; itemQuantity: number },
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Division item payments are not available under DATA_BACKEND=rama yet');
  }
  return await prisma.divisionItemPayment.upsert({
    where: { divisionId },
    create: {
      divisionId,
      steamItemId: data.steamItemId,
      itemQuantity: data.itemQuantity,
    },
    update: {
      steamItemId: data.steamItemId,
      itemQuantity: data.itemQuantity,
    },
  });
}

export async function deleteDivisionItemPayment(divisionId: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void divisionId;
    return { count: 0 };
  }
  return await prisma.divisionItemPayment.deleteMany({
    where: { divisionId },
  });
}
