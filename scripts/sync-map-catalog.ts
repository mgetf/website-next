#!/usr/bin/env bun
/**
 * Sync the /maps catalog from MGEMod configs + Serveme FastDL.
 *
 * For every .cfg on mgetf/MGEMod master, HEAD
 *   https://fastdl.serveme.tf/maps/<name>.bsp
 * and keep the GitHub raw .cfg URL. Names already in map_files are updated
 * to those URLs. Names missing a Serveme bsp are skipped.
 *
 * Dry-run (default):
 *   bun run scripts/sync-map-catalog.ts
 *   bun --env-file=.env.production run scripts/sync-map-catalog.ts
 *
 * Write:
 *   bun run scripts/sync-map-catalog.ts --apply
 *   bun --env-file=.env.production run scripts/sync-map-catalog.ts --apply
 */

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';

config();

const apply = process.argv.includes('--apply');
const MAP_NAME_PATTERN = /^[a-z0-9_]+$/;
const BSP_BASE = 'https://fastdl.serveme.tf/maps';
const CFG_BASE =
  'https://raw.githubusercontent.com/mgetf/MGEMod/refs/heads/master/addons/sourcemod/configs/mge';
const GITHUB_CONTENTS =
  'https://api.github.com/repos/mgetf/MGEMod/contents/addons/sourcemod/configs/mge?ref=master';
const USER_AGENT = 'mge.tf-map-catalog';
const HEAD_TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

type GithubContent = { name: string; type: string };

type Probe = {
  name: string;
  githubStem: string;
  bspUrl: string;
  cfgUrl: string;
  bspOk: boolean;
  cfgOk: boolean;
};

async function listGithubCfgStems(): Promise<string[]> {
  const res = await fetch(GITHUB_CONTENTS, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GitHub contents API failed (HTTP ${res.status})`);
  }
  const payload = (await res.json()) as GithubContent[];
  if (!Array.isArray(payload)) {
    throw new Error('GitHub contents API returned an unexpected payload');
  }

  return payload
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.cfg'))
    .map((entry) => entry.name.replace(/\.cfg$/i, ''))
    .filter((stem) => MAP_NAME_PATTERN.test(stem.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

async function remoteExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    if (head.status !== 405 && head.status !== 501) {
      return head.ok;
    }
  } catch {
    /* try GET */
  }

  try {
    const get = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    return get.ok;
  } catch {
    return false;
  }
}

async function poolMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function resolveUploader(): Promise<string> {
  const existing = await prisma.mapFile.findFirst({
    select: { uploadedBy: true },
    orderBy: { id: 'asc' },
  });
  if (existing) return existing.uploadedBy;

  const admin = await prisma.user.findFirst({
    where: { permissionLevel: 'ADMIN' },
    select: { steamId: true },
    orderBy: { steamId: 'asc' },
  });
  if (admin) return admin.steamId;

  throw new Error('No existing map uploader or ADMIN user found for uploaded_by');
}

try {
  const stems = await listGithubCfgStems();
  console.log(`GitHub master has ${stems.length} map config(s).`);

  const probes = await poolMap(stems, CONCURRENCY, async (githubStem): Promise<Probe> => {
    const name = githubStem.toLowerCase();
    const cfgUrl = `${CFG_BASE}/${githubStem}.cfg`;
    const bspCandidates = [
      ...new Set([`${BSP_BASE}/${githubStem}.bsp`, `${BSP_BASE}/${name}.bsp`]),
    ];
    const cfgOk = await remoteExists(cfgUrl);
    let bspUrl = bspCandidates[0]!;
    let bspOk = false;
    for (const candidate of bspCandidates) {
      if (await remoteExists(candidate)) {
        bspUrl = candidate;
        bspOk = true;
        break;
      }
    }
    return { name, githubStem, bspUrl, cfgUrl, bspOk, cfgOk };
  });

  const ready = probes.filter((p) => p.bspOk && p.cfgOk);
  const missingBsp = probes.filter((p) => p.cfgOk && !p.bspOk);
  const missingCfg = probes.filter((p) => !p.cfgOk);

  const existing = await prisma.mapFile.findMany({
    select: { id: true, name: true, bspUrl: true, cfgUrl: true },
  });
  const existingByName = new Map(existing.map((row) => [row.name, row]));

  const toInsert = ready.filter((p) => !existingByName.has(p.name));
  const toUpdate = ready.filter((p) => {
    const row = existingByName.get(p.name);
    return !!row && (row.bspUrl !== p.bspUrl || row.cfgUrl !== p.cfgUrl);
  });
  const unchanged = ready.filter((p) => {
    const row = existingByName.get(p.name);
    return !!row && row.bspUrl === p.bspUrl && row.cfgUrl === p.cfgUrl;
  });
  const orphans = existing.filter((row) => !ready.some((p) => p.name === row.name));

  console.log(`\nReady (Serveme + GitHub): ${ready.length}`);
  console.log(`  insert:    ${toInsert.length}`);
  console.log(`  update:    ${toUpdate.length}`);
  console.log(`  unchanged: ${unchanged.length}`);
  console.log(`Missing Serveme .bsp: ${missingBsp.length}`);
  console.log(`Missing GitHub .cfg:  ${missingCfg.length}`);
  console.log(`Catalog rows without a matching pair: ${orphans.length}`);

  if (toInsert.length > 0) {
    console.log('\nInsert:');
    for (const p of toInsert) console.log(`  + ${p.name}`);
  }
  if (toUpdate.length > 0) {
    console.log('\nUpdate URLs:');
    for (const p of toUpdate) console.log(`  ~ ${p.name}`);
  }
  if (missingBsp.length > 0) {
    console.log('\nSkip (no Serveme .bsp):');
    for (const p of missingBsp) console.log(`  - ${p.name}`);
  }
  if (missingCfg.length > 0) {
    console.log('\nSkip (GitHub .cfg HEAD failed):');
    for (const p of missingCfg) console.log(`  - ${p.name}`);
  }
  if (orphans.length > 0) {
    console.log('\nLeave in catalog (no matching Serveme+GitHub pair):');
    for (const row of orphans) console.log(`  ? ${row.name}`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write these changes.');
    process.exit(0);
  }

  const uploadedBy = await resolveUploader();

  for (const p of toInsert) {
    await prisma.mapFile.create({
      data: {
        name: p.name,
        bspUrl: p.bspUrl,
        cfgUrl: p.cfgUrl,
        uploadedBy,
      },
    });
    console.log(`Inserted ${p.name}`);
  }

  for (const p of toUpdate) {
    const row = existingByName.get(p.name)!;
    await prisma.mapFile.update({
      where: { id: row.id },
      data: { bspUrl: p.bspUrl, cfgUrl: p.cfgUrl },
    });
    console.log(`Updated ${p.name}`);
  }

  console.log(`\nDone. Inserted ${toInsert.length}, updated ${toUpdate.length}.`);
} finally {
  await prisma.$disconnect();
}
