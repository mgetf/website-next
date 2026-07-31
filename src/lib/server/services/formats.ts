/**
 * Format Service Layer
 * Manages game formats (1v1, 2v2, etc.)
 */

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
  throw new Error('getFormats requires DATA_BACKEND=rama');
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
  throw new Error('createFormat requires DATA_BACKEND=rama');
}

export async function deleteFormat(id: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Format delete is not available under DATA_BACKEND=rama yet');
  }
  throw new Error('deleteFormat requires DATA_BACKEND=rama');
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
  throw new Error('getFormatsForFilter requires DATA_BACKEND=rama');
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
  throw new Error('updateFormat requires DATA_BACKEND=rama');
}
