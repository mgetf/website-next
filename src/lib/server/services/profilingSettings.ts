/**
 * Staff-calibrated profiling weights. Defaults live in code; the DB row is an override.
 */

import { prisma } from '$lib/server/db';
import { Prisma } from '$prisma/client.js';
import { z } from 'zod';
import { badRequest } from '$lib/server/utils/errors';
import { DEFAULT_PROFILING_WEIGHTS, mergeProfilingWeights } from '$lib/utils/profiling';
import type { ProfilingWeights } from '$lib/types/profiling';

const nonNeg = z.number().finite().min(0).max(100);
const unit = z.number().finite().min(0).max(1);
const positive = z.number().finite().positive().max(100_000);

export const profilingWeightsSchema = z.object({
  trust: z.object({
    steamAgeYears: nonNeg,
    tf2Hours: nonNeg,
    profilePublic: nonNeg,
    discordLinked: nonNeg,
    mgeTenureSeasons: nonNeg,
    altPenalty: nonNeg,
    banPenalty: nonNeg,
  }),
  skill: z.object({
    mgeElo: nonNeg,
    mgeClasselo: nonNeg,
    pastDivision: nonNeg,
    logsTfVolume: nonNeg,
    tf2Hours: nonNeg,
    mgeServerHours: nonNeg,
  }),
  thresholds: z.object({
    steamAgeYearsFull: positive,
    tf2HoursFull: positive,
    mgeTenureSeasonsFull: positive,
    eloLow: z.number().finite().min(0).max(5000),
    eloHigh: z.number().finite().min(1).max(5000),
    rdFullPenalty: positive,
    provisionalFactor: unit,
    altLikelyPenalty: unit,
    altLinkedPenalty: unit,
    banWarningPenalty: unit,
    banSuspendedPenalty: unit,
    banBannedPenalty: unit,
    logsTfVolumeFull: positive,
    mgeServerHoursFull: positive,
    logsFewThreshold: z.number().finite().min(0).max(10_000),
    uncertaintyMissingSteam: unit,
    uncertaintyNoMgeRating: unit,
    uncertaintyProvisional: unit,
    uncertaintyFewLogs: unit,
    uncertaintyNoPastSeasons: unit,
  }),
});

export type ProfilingSettingsView = {
  weights: ProfilingWeights;
  defaults: ProfilingWeights;
  updatedAt: string | null;
};

function parseStoredWeights(raw: unknown): ProfilingWeights {
  return mergeProfilingWeights(raw);
}

export async function getProfilingSettings(): Promise<ProfilingSettingsView> {
  const row = await prisma.profilingSettings.findUnique({ where: { id: 1 } });
  const weights = parseStoredWeights(row?.weights);
  return {
    weights,
    defaults: DEFAULT_PROFILING_WEIGHTS,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function saveProfilingSettings(input: unknown): Promise<ProfilingSettingsView> {
  const merged = mergeProfilingWeights(input);
  const parsed = profilingWeightsSchema.safeParse(merged);
  if (!parsed.success) badRequest('Invalid profiling weights');
  if (parsed.data.thresholds.eloHigh <= parsed.data.thresholds.eloLow) {
    badRequest('ELO ceiling must be greater than ELO floor');
  }

  const weightsJson = parsed.data as unknown as Prisma.InputJsonValue;
  await prisma.profilingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, weights: weightsJson },
    update: { weights: weightsJson },
  });

  return getProfilingSettings();
}

export async function resetProfilingSettings(): Promise<ProfilingSettingsView> {
  await prisma.profilingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, weights: {} as Prisma.InputJsonValue },
    update: { weights: {} as Prisma.InputJsonValue },
  });
  return getProfilingSettings();
}
