import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ZipArchive } from 'archiver';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { getMapFilesByIds } from '$lib/server/services/mapFiles';
import { mapDownloadRateLimiter, checkRateLimit } from '$lib/server/utils/rateLimit';
import { fetchPublicHttps, PublicHttpsUrlError } from '$lib/server/utils/publicHttpsUrl';

interface MapRequest {
  id: number;
  bsp: boolean;
  cfg: boolean;
}

const BSP_MAX_BYTES = 500 * 1024 * 1024;
const CFG_MAX_BYTES = 1 * 1024 * 1024;
const ZIP_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;

function byteLimitTransform(maxBytes: number, label: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      seen += (chunk as Buffer).length;
      if (seen > maxBytes) {
        cb(new Error(`${label} is larger than the allowed size`));
        return;
      }
      cb(null, chunk);
    },
  });
}

function webBodyToNode(body: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(body as import('node:stream/web').ReadableStream);
}

async function appendRemoteFile(
  archive: InstanceType<typeof ZipArchive>,
  url: string,
  zipPath: string,
  maxBytes: number,
): Promise<void> {
  const res = await fetchPublicHttps(url, { maxBytes, timeoutMs: FETCH_TIMEOUT_MS });
  if (!res.body) {
    throw new PublicHttpsUrlError(`Empty body fetching ${url}`);
  }

  const limited = webBodyToNode(res.body).pipe(byteLimitTransform(maxBytes, zipPath));
  archive.append(limited, { name: zipPath });
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const { allowed, response } = checkRateLimit(mapDownloadRateLimiter, getClientAddress());
  if (!allowed) return response!;

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
  const uniqueIds = [...new Set(mapIds)];
  const maps = await getMapFilesByIds(uniqueIds);

  if (maps.length !== uniqueIds.length) {
    return json({ error: 'One or more maps were not found' }, { status: 404 });
  }

  const prefByMapId = new Map(mapRequests.map((r) => [r.id, r]));
  const mapsById = new Map(maps.map((m) => [m.id, m]));

  const tempDir = await mkdtemp(join(tmpdir(), 'mge-maps-'));
  const zipPath = join(tempDir, 'mge-maps.zip');

  let archive: InstanceType<typeof ZipArchive> | null = null;
  let writeStream: ReturnType<typeof createWriteStream> | null = null;

  try {
    writeStream = createWriteStream(zipPath);
    const zipLimiter = byteLimitTransform(ZIP_MAX_BYTES, 'zip');
    archive = new ZipArchive({ zlib: { level: 6 } });

    const archiveFailed = new Promise<never>((_, reject) => {
      archive!.on('error', reject);
      zipLimiter.on('error', reject);
      writeStream!.on('error', reject);
    });

    archive.pipe(zipLimiter).pipe(writeStream);

    const build = (async () => {
      for (const req of mapRequests) {
        const map = mapsById.get(req.id);
        const pref = prefByMapId.get(req.id);
        if (!map || !pref) continue;

        if (pref.bsp) {
          await appendRemoteFile(archive!, map.bspUrl, `maps/${map.name}.bsp`, BSP_MAX_BYTES);
        }
        if (pref.cfg) {
          await appendRemoteFile(
            archive!,
            map.cfgUrl,
            `addons/sourcemod/configs/mge/${map.name}.cfg`,
            CFG_MAX_BYTES,
          );
        }
      }

      await archive!.finalize();
      await finished(writeStream!);
    })();

    await Promise.race([build, archiveFailed]);
  } catch (err) {
    try {
      archive?.abort();
    } catch {
      /* already closed */
    }
    writeStream?.destroy();
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    const message =
      err instanceof PublicHttpsUrlError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to build map zip';
    console.error('Map zip build failed:', err);
    return json({ error: message }, { status: 502 });
  }

  try {
    const fileStat = await stat(zipPath);
    const fileStream = createReadStream(zipPath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

    const cleanup = () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    };
    fileStream.on('close', cleanup);
    fileStream.on('error', cleanup);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="mge-maps.zip"',
        'Content-Length': String(fileStat.size),
      },
    });
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    console.error('Map zip read failed:', err);
    return json({ error: 'Failed to read map zip' }, { status: 500 });
  }
};
