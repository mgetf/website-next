/**
 * Format Service Layer
 * Manages game formats (1v1, 2v2, etc.)
 */

import { prisma } from '$lib/server/db';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';

async function getFormatsRama() {
  const { ramaClientOpts } = await import('$lib/server/rama/config');
  const { createCatalogClient, getFormat, getFormatIds } = await import('$lib/server/rama/catalog');
  const client = createCatalogClient(ramaClientOpts());
  let ids = await getFormatIds(client);
  if (ids.length === 0) {
    // Fallback for clusters seeded before $$format-ids existed.
    ids = [String(FORMAT_1V1), String(FORMAT_2V2)];
  }
  const rows = [];
  for (const id of ids) {
    const format = await getFormat(client, id);
    if (!format) continue;
    rows.push({
      id: Number(id),
      name: format.name,
      code: format.code,
      _count: { seasons: 0, teams: 0, activeSignupSeasons: 0 },
    });
  }
  rows.sort((a, b) => a.id - b.id);
  return rows;
}

export async function getFormats() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return getFormatsRama();

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

export async function createFormat(data: { name: string; code: string }) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createCatalogClient, upsertFormat, getFormatIdByCode } =
      await import('$lib/server/rama/catalog');
    const client = createCatalogClient(ramaClientOpts());
    const code = data.code.trim();
    const existing = await getFormatIdByCode(client, code);
    if (existing) {
      throw new Error(`Format with code "${code}" already exists`);
    }
    const formatId = String(Date.now() % 1_000_000_000);
    const ack = await upsertFormat(client, {
      formatId,
      name: data.name.trim(),
      code,
    });
    if (!ack.ok) throw new Error(ack.error || 'Failed to create format');
    return { id: Number(formatId), name: data.name.trim(), code };
  }

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
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Format delete is not available under DATA_BACKEND=rama yet');
  }

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
    blockers.push(
      `${format._count.teamHistory} team history record${format._count.teamHistory !== 1 ? 's' : ''}`,
    );
  if (format._count.activeSignupSeasons > 0) blockers.push('active signup configuration');

  if (blockers.length > 0) {
    throw new Error(`Cannot delete format: it has ${blockers.join(', ')}.`);
  }

  return await prisma.format.delete({ where: { id } });
}

/**
 * Get formats for filter/dropdown UI
 */
export async function getFormatsForFilter(): Promise<{ id: number; name: string; code: string }[]> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const rows = await getFormatsRama();
    return rows.map(({ id, name, code }) => ({ id, name, code }));
  }

  return prisma.format.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { id: 'asc' },
  });
}

export async function updateFormat(id: number, data: { name: string; code: string }) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createCatalogClient, upsertFormat, getFormatIdByCode } =
      await import('$lib/server/rama/catalog');
    const client = createCatalogClient(ramaClientOpts());
    const code = data.code.trim();
    const takenBy = await getFormatIdByCode(client, code);
    if (takenBy && takenBy !== String(id)) {
      throw new Error(`Format with code "${code}" already exists`);
    }
    const ack = await upsertFormat(client, {
      formatId: String(id),
      name: data.name.trim(),
      code,
    });
    if (!ack.ok) throw new Error(ack.error || 'Failed to update format');
    return { id, name: data.name.trim(), code };
  }

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
