import { prisma } from '$lib/server/db';

export async function upsertDivisionItemPayment(
  divisionId: number,
  data: { steamItemId: number; itemQuantity: number },
) {
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
  return await prisma.divisionItemPayment.deleteMany({
    where: { divisionId },
  });
}
