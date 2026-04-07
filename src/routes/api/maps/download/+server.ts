import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import archiver from 'archiver';
import { Readable } from 'stream';
import { getMapFilesByIds } from '$lib/server/services/mapFiles';

type FileEntry = { type: 'bsp' | 'cfg'; name: string; buffer: Buffer };

interface MapRequest {
  id: number;
  bsp: boolean;
  cfg: boolean;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: { maps?: unknown };

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawMaps = body?.maps;

  if (!Array.isArray(rawMaps) || rawMaps.length === 0) {
    return json({ error: 'maps must be a non-empty array' }, { status: 400 });
  }

  // Parse and validate per-map requests
  const mapRequests: MapRequest[] = [];
  for (const entry of rawMaps) {
    if (!entry || typeof entry !== 'object') continue;
    const id = parseInt(String((entry as Record<string, unknown>).id), 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    const bsp = (entry as Record<string, unknown>).bsp !== false;
    const cfg = (entry as Record<string, unknown>).cfg !== false;
    if (bsp || cfg) mapRequests.push({ id, bsp, cfg });
  }

  if (mapRequests.length === 0) {
    return json({ error: 'No valid map entries provided' }, { status: 400 });
  }

  if (mapRequests.length > 50) {
    return json({ error: 'Cannot download more than 50 maps at once' }, { status: 400 });
  }

  const mapIds = mapRequests.map((m) => m.id);
  const maps = await getMapFilesByIds(mapIds);

  if (maps.length === 0) {
    return json({ error: 'No maps found for the provided IDs' }, { status: 404 });
  }

  // Build a lookup for per-map file preferences
  const prefByMapId = new Map(mapRequests.map((r) => [r.id, r]));

  // Fetch the needed files from R2 via their public URLs concurrently
  const filePromises: Promise<FileEntry>[] = [];

  for (const m of maps) {
    const pref = prefByMapId.get(m.id);
    if (!pref) continue;

    if (pref.bsp) {
      filePromises.push(
        fetch(m.bspUrl).then(async (r): Promise<FileEntry> => {
          if (!r.ok) throw new Error(`Failed to fetch ${m.name}.bsp`);
          return { type: 'bsp', name: m.name, buffer: Buffer.from(await r.arrayBuffer()) };
        }),
      );
    }

    if (pref.cfg) {
      filePromises.push(
        fetch(m.cfgUrl).then(async (r): Promise<FileEntry> => {
          if (!r.ok) throw new Error(`Failed to fetch ${m.name}.cfg`);
          return { type: 'cfg', name: m.name, buffer: Buffer.from(await r.arrayBuffer()) };
        }),
      );
    }
  }

  const fileResults = await Promise.allSettled(filePromises);

  const files: FileEntry[] = fileResults
    .filter((r): r is PromiseFulfilledResult<FileEntry> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (files.length === 0) {
    return json({ error: 'Failed to retrieve map files from storage' }, { status: 502 });
  }

  // Build zip with correct TF2 directory structure
  const { PassThrough } = await import('stream');
  const passthrough = new PassThrough();

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    passthrough.destroy(err);
  });

  archive.pipe(passthrough);

  for (const file of files) {
    if (file.type === 'bsp') {
      archive.append(Readable.from(file.buffer), { name: `maps/${file.name}.bsp` });
    } else {
      archive.append(Readable.from(file.buffer), {
        name: `addons/sourcemod/configs/mge/${file.name}.cfg`,
      });
    }
  }

  archive.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of passthrough) {
    chunks.push(Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="mge-maps.zip"',
      'Content-Length': String(zipBuffer.length),
    },
  });
};
