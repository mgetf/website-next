#!/usr/bin/env bun
/**
 * One-Time Migration: Hash Legacy Plaintext Join Passwords
 *
 * Finds `join_password` values on `teams` and `teams_history` that are not in
 * the `salt:hash` format produced by hashPassword() and re-writes them as
 * scrypt hashes. Run this against staging/production BEFORE deploying the
 * change that removes the plaintext fallback from verifyPassword().
 *
 * Usage:
 *   bun run scripts/migrate-plaintext-join-passwords.ts --dry-run
 *   bun run scripts/migrate-plaintext-join-passwords.ts
 */

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';
import { hashPassword, isHashedPassword } from '../src/lib/server/utils/password';

config();

const dryRun = process.argv.includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

async function migrateModel(
  label: string,
  findMany: () => Promise<{ id: number; joinPassword: string | null }[]>,
  update: (id: number, hashed: string) => Promise<unknown>,
): Promise<void> {
  const rows = await findMany();
  const plaintextRows = rows.filter(
    (row): row is { id: number; joinPassword: string } =>
      !!row.joinPassword && !isHashedPassword(row.joinPassword),
  );

  console.log(`${label}: ${rows.length} with a join password, ${plaintextRows.length} plaintext`);

  for (const row of plaintextRows) {
    if (dryRun) {
      console.log(`  [dry-run] would hash ${label} id=${row.id}`);
      continue;
    }

    const hashed = await hashPassword(row.joinPassword);
    await update(row.id, hashed);
    console.log(`  hashed ${label} id=${row.id}`);
  }
}

async function main() {
  console.log(
    dryRun ? 'Running in dry-run mode (no writes)' : 'Running migration (writes enabled)',
  );

  await migrateModel(
    'teams',
    () =>
      prisma.team.findMany({
        where: { joinPassword: { not: null } },
        select: { id: true, joinPassword: true },
      }),
    (id, hashed) => prisma.team.update({ where: { id }, data: { joinPassword: hashed } }),
  );

  await migrateModel(
    'teams_history',
    () =>
      prisma.teamHistory.findMany({
        where: { joinPassword: { not: null } },
        select: { id: true, joinPassword: true },
      }),
    (id, hashed) => prisma.teamHistory.update({ where: { id }, data: { joinPassword: hashed } }),
  );

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
