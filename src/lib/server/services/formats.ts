/**
 * Format Service Layer
 * Manages game formats (1v1, 2v2, etc.)
 */

import { prisma } from '$lib/server/db';

export async function getFormats() {
  return prisma.format.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          activeSignupSeasons: true,
        },
      },
    },
  });
}

export async function getFormatById(id: number) {
  return prisma.format.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          activeSignupSeasons: true,
        },
      },
    },
  });
}

export async function createFormat(data: { name: string; code: string }) {
  // Check if code already exists
  const existing = await prisma.format.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    throw new Error(`Format with code "${data.code}" already exists`);
  }

  return prisma.format.create({
    data: {
      name: data.name.trim(),
      code: data.code.trim(),
    },
  });
}

export async function updateFormat(
  id: number,
  data: { name: string; code: string },
) {
  // Check if we're changing the code to one that already exists
  const existing = await prisma.format.findFirst({
    where: {
      code: data.code,
      NOT: { id },
    },
  });

  if (existing) {
    throw new Error(`Format with code "${data.code}" already exists`);
  }

  return prisma.format.update({
    where: { id },
    data: {
      name: data.name.trim(),
      code: data.code.trim(),
    },
  });
}
