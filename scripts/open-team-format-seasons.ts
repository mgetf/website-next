#!/usr/bin/env bun
/**
 * Open Ultiduo and BBall Season 1 signups in every region.
 *
 * Creates format rows (ids 3 and 4), unhides hidden regions, copies a
 * division ladder into regions that have none, then opens Season 1
 * signups and points active_signup_seasons at those seasons.
 *
 * Existing 1v1 / 2v2 seasons are left alone.
 *
 * Usage:
 *   bun run scripts/open-team-format-seasons.ts --dry-run
 *   bun --env-file=.env.production run scripts/open-team-format-seasons.ts
 */

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';
import {
  FORMAT_BBALL,
  FORMAT_ULTIDUO,
} from '../src/lib/constants/formats';

config();

const dryRun = process.argv.includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

const NEW_FORMATS = [
  { id: FORMAT_ULTIDUO, name: 'Ultiduo', code: 'ultiduo' },
  { id: FORMAT_BBALL, name: 'BBall', code: 'bball' },
] as const;

const FALLBACK_DIVISIONS = [
  { name: 'NEWCOMER', signupCost: 0 },
  { name: 'OPEN', signupCost: 2 },
  { name: 'INTERMEDIATE', signupCost: 2 },
  { name: 'INVITE', signupCost: 2 },
];

async function main() {
  const regions = await prisma.region.findMany({ orderBy: { id: 'asc' } });
  if (regions.length === 0) {
    throw new Error('No regions in database');
  }

  console.log(`Regions: ${regions.map((r) => `${r.name}${r.hidden ? ' (hidden)' : ''}`).join(', ')}`);
  console.log(dryRun ? 'DRY RUN — no writes' : 'LIVE — writing seasons');

  if (!dryRun) {
    for (const format of NEW_FORMATS) {
      await prisma.format.upsert({
        where: { code: format.code },
        create: format,
        update: { name: format.name },
      });
    }
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('formats', 'id'), (SELECT MAX(id) FROM formats))`,
    );

    await prisma.region.updateMany({
      where: { hidden: { not: 0 } },
      data: { hidden: 0 },
    });
  }

  const visibleRegions = dryRun
    ? regions
    : await prisma.region.findMany({ orderBy: { id: 'asc' } });

  for (const region of visibleRegions) {
    const existingDivs = await prisma.division.findMany({
      where: { regionId: region.id },
    });
    if (existingDivs.length === 0) {
      console.log(`  ${region.name}: no divisions — ${dryRun ? 'would copy' : 'copying'} fallback ladder`);
      if (!dryRun) {
        for (const div of FALLBACK_DIVISIONS) {
          await prisma.division.create({
            data: {
              name: div.name,
              signupCost: div.signupCost,
              hidden: 0,
              regionId: region.id,
            },
          });
        }
      }
    }

    for (const format of NEW_FORMATS) {
      const existing = await prisma.season.findFirst({
        where: { regionId: region.id, formatId: format.id },
        orderBy: { seasonNum: 'desc' },
      });
      if (existing) {
        console.log(
          `  ${region.name} ${format.name}: season ${existing.id} already exists (S${existing.seasonNum}) — ${dryRun ? 'would open' : 'opening'} signups`,
        );
        if (!dryRun) {
          await prisma.season.update({
            where: { id: existing.id },
            data: { signupsOpen: true, rosterLocked: false },
          });
          await prisma.activeSignupSeason.upsert({
            where: { regionId_formatId: { regionId: region.id, formatId: format.id } },
            create: { regionId: region.id, formatId: format.id, seasonId: existing.id },
            update: { seasonId: existing.id },
          });
        }
        continue;
      }

      console.log(`  ${region.name} ${format.name}: ${dryRun ? 'would create' : 'creating'} Season 1`);
      if (!dryRun) {
        const season = await prisma.season.create({
          data: {
            seasonNum: 1,
            numWeeks: 7,
            regionId: region.id,
            formatId: format.id,
            signupsOpen: true,
            rosterLocked: false,
            paymentRequired: false,
            info: `${format.name} Season 1 — signups open`,
          },
        });
        await prisma.activeSignupSeason.upsert({
          where: { regionId_formatId: { regionId: region.id, formatId: format.id } },
          create: { regionId: region.id, formatId: format.id, seasonId: season.id },
          update: { seasonId: season.id },
        });
      }
    }
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
