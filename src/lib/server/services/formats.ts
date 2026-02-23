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

export async function deleteFormat(id: number) {
  const format = await prisma.format.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          teamHistory: true,
          activeSignupSeasons: true,
        },
      },
    },
  });

  if (!format) {
    throw new Error('Format not found');
  }

  const blockers: string[] = [];
  if (format._count.seasons > 0)
    blockers.push(`${format._count.seasons} season${format._count.seasons !== 1 ? 's' : ''}`);
  if (format._count.teams > 0)
    blockers.push(`${format._count.teams} team${format._count.teams !== 1 ? 's' : ''}`);
  if (format._count.teamHistory > 0)
    blockers.push(`${format._count.teamHistory} team history record${format._count.teamHistory !== 1 ? 's' : ''}`);
  if (format._count.activeSignupSeasons > 0)
    blockers.push('active signup configuration');

  if (blockers.length > 0) {
    throw new Error(`Cannot delete format: it has ${blockers.join(', ')}.`);
  }

  return await prisma.format.delete({ where: { id } });
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
