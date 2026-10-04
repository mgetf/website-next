import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILING_WEIGHTS,
  emptyProfilingRaw,
  evidenceScore,
  log01,
  mergeProfilingWeights,
  profilingWeightChanges,
  scoreProfile,
  weightsFromFlatRecord,
} from './profiling';
import type { ProfilingRawSignals } from '$lib/types/profiling';

function score(overrides: Partial<ProfilingRawSignals> = {}) {
  return scoreProfile({ ...emptyProfilingRaw(), ...overrides }, DEFAULT_PROFILING_WEIGHTS);
}

describe('mergeProfilingWeights', () => {
  it('fills missing keys from defaults', () => {
    const merged = mergeProfilingWeights({
      skill: { mgeElo: 3 },
    });
    expect(merged.skill.mgeElo).toBe(3);
    expect(merged.skill.pastDivision).toBe(DEFAULT_PROFILING_WEIGHTS.skill.pastDivision);
    expect(merged.trust.steamAgeYears).toBe(DEFAULT_PROFILING_WEIGHTS.trust.steamAgeYears);
  });

  it('returns defaults for invalid input', () => {
    expect(mergeProfilingWeights(null).trust.altPenalty).toBe(
      DEFAULT_PROFILING_WEIGHTS.trust.altPenalty,
    );
  });

  it('rebuilds nested weights from dotted form fields', () => {
    const nested = weightsFromFlatRecord({
      'trust.steamAgeYears': 2,
      'skill.mgeElo': 4,
      'thresholds.eloHigh': 2400,
    });
    expect(nested.trust.steamAgeYears).toBe(2);
    expect(nested.skill.mgeElo).toBe(4);
    expect(nested.thresholds.eloHigh).toBe(2400);
  });

  it('lists only the numbers that changed', () => {
    const next = mergeProfilingWeights({
      trust: { altPenalty: 0.9 },
      thresholds: { eloHigh: 2500 },
    });
    expect(profilingWeightChanges(DEFAULT_PROFILING_WEIGHTS, next)).toEqual({
      'trust.altPenalty': {
        from: DEFAULT_PROFILING_WEIGHTS.trust.altPenalty,
        to: 0.9,
      },
      'thresholds.eloHigh': {
        from: DEFAULT_PROFILING_WEIGHTS.thresholds.eloHigh,
        to: 2500,
      },
    });
    expect(profilingWeightChanges(next, next)).toEqual({});
  });
});

describe('evidenceScore', () => {
  it('discounts skill by uncertainty', () => {
    expect(evidenceScore(0.8, 0.1)).toBe(0.72);
    expect(evidenceScore(0.8, 0.7)).toBe(0.24);
    expect(evidenceScore(0.3, 0.1)).toBe(0.27);
    expect(evidenceScore(0, 0.8)).toBe(0);
  });
});

describe('scoreProfile', () => {
  it('gives low skill and high uncertainty when almost everything is missing', () => {
    const result = score();
    expect(result.skill).toBe(0);
    expect(result.evidence).toBe(0);
    expect(result.skillUncertainty).toBeGreaterThan(0.5);
    expect(result.signals.filter((signal) => signal.axis === 'skill').every((s) => s.missing)).toBe(
      true,
    );
  });

  it('scores a returning Invite-like account higher than a new private account', () => {
    const fresh = score({
      steamAgeYears: 0.2,
      tf2Hours: 12,
      profilePublic: false,
      discordLinked: false,
      mgeTenureSeasons: 0,
      banStatus: 'NONE',
    });
    const returning = score({
      steamAgeYears: 8,
      tf2Hours: 3500,
      profilePublic: true,
      discordLinked: true,
      mgeTenureSeasons: 5,
      banStatus: 'NONE',
      mgeElo: 1900,
      mgeEloRd: 40,
      mgeEloProvisional: false,
      mgeClasselo: 1850,
      mgeClasseloRd: 50,
      mgeClasseloProvisional: false,
      pastDivisionSkill: 1,
      pastDivisionName: 'Invite',
      logsTfRecentCount: 120,
      mgeServerHours: 80,
    });

    expect(returning.trust).toBeGreaterThan(fresh.trust);
    expect(returning.skill).toBeGreaterThan(fresh.skill);
    expect(returning.skillUncertainty).toBeLessThan(fresh.skillUncertainty);
    expect(returning.skill).toBeGreaterThan(0.7);
  });

  it('lowers trust when likely alts are present', () => {
    const clean = score({
      steamAgeYears: 6,
      tf2Hours: 800,
      profilePublic: true,
      discordLinked: true,
      mgeTenureSeasons: 2,
      banStatus: 'NONE',
    });
    const alts = score({
      steamAgeYears: 6,
      tf2Hours: 800,
      profilePublic: true,
      discordLinked: true,
      mgeTenureSeasons: 2,
      banStatus: 'NONE',
      altLikelyCount: 2,
    });
    expect(alts.trust).toBeLessThan(clean.trust);
    expect(alts.signals.find((signal) => signal.id === 'altPenalty')?.note).toContain('likely');
  });

  it('cuts skill and raises uncertainty for a provisional rating', () => {
    const stable = score({
      mgeElo: 1700,
      mgeEloRd: 35,
      mgeEloProvisional: false,
      pastDivisionSkill: 0.5,
      pastDivisionName: 'Intermediate',
      logsTfRecentCount: 40,
    });
    const provisional = score({
      mgeElo: 1700,
      mgeEloRd: 35,
      mgeEloProvisional: true,
      pastDivisionSkill: 0.5,
      pastDivisionName: 'Intermediate',
      logsTfRecentCount: 40,
    });
    expect(provisional.skill).toBeLessThan(stable.skill);
    expect(provisional.skillUncertainty).toBeGreaterThan(stable.skillUncertainty);
    expect(provisional.evidence).toBe(
      evidenceScore(provisional.skill, provisional.skillUncertainty),
    );
  });

  it('does not invent skill for a missing ELO when other activity exists', () => {
    const result = score({
      tf2Hours: 400,
      mgeServerHours: 10,
      logsTfRecentCount: 4,
    });
    const eloSignal = result.signals.find(
      (signal) => signal.id === 'mgeElo' && signal.axis === 'skill',
    );
    expect(eloSignal?.missing).toBe(true);
    expect(eloSignal?.contribution).toBe(0);
    expect(result.skill).toBeGreaterThan(0);
    expect(
      result.signals
        .filter((signal) => signal.axis === 'skill' && !signal.missing)
        .every((signal) => signal.id !== 'mgeElo' && signal.id !== 'mgeClasselo'),
    ).toBe(true);
  });

  it('uses log scaling so extra TF2 hours taper off', () => {
    expect(log01(2000, 2000)).toBe(1);
    expect(log01(200, 2000)).toBeGreaterThan(log01(20, 2000));
    expect(log01(200, 2000) - log01(20, 2000)).toBeGreaterThan(
      log01(2000, 2000) - log01(400, 2000),
    );
  });
});
