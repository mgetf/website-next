import type { MatchSetDraftPairingInput } from '$lib/types/matchSetDraft';

export function parseMatchSetPairings(value: unknown): MatchSetDraftPairingInput[] {
  if (!Array.isArray(value)) {
    throw new Error('Pairings must be an array');
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Pairing ${index + 1} is invalid`);
    }
    const homeTeamId = Number((entry as { homeTeamId?: unknown }).homeTeamId);
    const awayTeamId = Number((entry as { awayTeamId?: unknown }).awayTeamId);
    if (!Number.isInteger(homeTeamId) || homeTeamId <= 0) {
      throw new Error(`Pairing ${index + 1} has an invalid home team`);
    }
    if (!Number.isInteger(awayTeamId) || awayTeamId <= 0) {
      throw new Error(`Pairing ${index + 1} has an invalid away team`);
    }
    return { homeTeamId, awayTeamId };
  });
}

export function parseByeTeamIds(value: unknown): number[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error('Bye team IDs must be an array');
  }
  return value.map((id, index) => {
    const teamId = Number(id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new Error(`Bye team ${index + 1} is invalid`);
    }
    return teamId;
  });
}

export function validateMatchSetDraftTeams(
  pairings: MatchSetDraftPairingInput[],
  byeTeamIds: number[],
) {
  if (pairings.length === 0) {
    throw new Error('At least one match pairing is required');
  }

  const seen = new Set<number>();
  for (const [index, pairing] of pairings.entries()) {
    if (pairing.homeTeamId === pairing.awayTeamId) {
      throw new Error(`A team cannot play itself in pairing ${index + 1}`);
    }
    if (seen.has(pairing.homeTeamId)) {
      throw new Error(`Team ${pairing.homeTeamId} appears in more than one pairing`);
    }
    if (seen.has(pairing.awayTeamId)) {
      throw new Error(`Team ${pairing.awayTeamId} appears in more than one pairing`);
    }
    seen.add(pairing.homeTeamId);
    seen.add(pairing.awayTeamId);
  }

  for (const teamId of byeTeamIds) {
    if (seen.has(teamId)) {
      throw new Error(`Team ${teamId} cannot be both paired and given a bye`);
    }
    seen.add(teamId);
  }
}
