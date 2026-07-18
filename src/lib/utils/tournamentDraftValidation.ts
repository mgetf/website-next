/**
 * Tournament Draft Structural Validation
 *
 * Pure, client-safe checks for an EventDraftPayload: unique ordering, valid
 * sides/scores, acyclic progression, valid destination slots, format-specific
 * round rules, and placement consistency. Used by the editor UI for live
 * feedback and by the server before publishing (see
 * `$lib/server/services/eventEditor.ts`).
 */

import type {
  EventDraftPayload,
  DraftStage,
  DraftEliminationMatch,
  ValidationIssue,
} from '$lib/types/tournament-editor';

export function validateDraftStructure(payload: EventDraftPayload): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!payload.name.trim()) {
    issues.push({ path: 'name', message: 'Event name is required.', severity: 'error' });
  }

  if (payload.stages.length === 0) {
    issues.push({ path: 'stages', message: 'Add at least one stage.', severity: 'warning' });
  }

  const participantIds = new Set(payload.participants.map((p) => p.steamId));
  const participantSteamIds = payload.participants.map((p) => p.steamId);
  if (new Set(participantSteamIds).size !== participantSteamIds.length) {
    issues.push({
      path: 'participants',
      message: 'Each participant can only be added once.',
      severity: 'error',
    });
  }

  const stageOrders = payload.stages.map((stage) => stage.orderNum);
  if (new Set(stageOrders).size !== stageOrders.length) {
    issues.push({
      path: 'stages',
      message: 'Stage order numbers must be unique.',
      severity: 'error',
    });
  }

  payload.stages.forEach((stage, stageIdx) => {
    validateStage(stage, stageIdx, issues);
  });

  payload.placements.forEach((placement, idx) => {
    if (!participantIds.has(placement.steamId)) {
      issues.push({
        path: `placements[${idx}].steamId`,
        message: `Placement references a player who is not in the participants list.`,
        severity: 'error',
      });
    }
  });

  const seenPlacements = new Map<number, number>();
  payload.placements.forEach((p) => {
    seenPlacements.set(p.placement, (seenPlacements.get(p.placement) ?? 0) + 1);
  });
  for (const [placement, count] of seenPlacements) {
    if (count > 1) {
      issues.push({
        path: 'placements',
        message: `Placement ${placement} is assigned to ${count} players.`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

function validateStage(stage: DraftStage, stageIdx: number, issues: ValidationIssue[]): void {
  if (!stage.name.trim()) {
    issues.push({
      path: `stages[${stageIdx}].name`,
      message: 'Stage name is required.',
      severity: 'error',
    });
  }

  if (stage.matches.length === 0) {
    issues.push({
      path: `stages[${stageIdx}].matches`,
      message: `Stage "${stage.name}" has no matches.`,
      severity: 'warning',
    });
  }

  const orderNums = new Map<string, number>();
  for (const m of stage.matches) {
    const section =
      stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM'
        ? (m as DraftEliminationMatch).section
        : stage.bracketFormat;
    const key = `${section}:${m.round ?? 'none'}:${m.orderNum}`;
    orderNums.set(key, (orderNums.get(key) ?? 0) + 1);
  }
  for (const [position, count] of orderNums) {
    if (count > 1) {
      issues.push({
        path: `stages[${stageIdx}].matches`,
        message: `Duplicate match position ${position} within stage "${stage.name}".`,
        severity: 'error',
      });
    }
  }

  stage.matches.forEach((match, matchIdx) => {
    const path = `stages[${stageIdx}].matches[${matchIdx}]`;

    if (match.side1Score !== null && match.side1Score < 0) {
      issues.push({
        path: `${path}.side1Score`,
        message: 'Score cannot be negative.',
        severity: 'error',
      });
    }
    if (match.side2Score !== null && match.side2Score < 0) {
      issues.push({
        path: `${path}.side2Score`,
        message: 'Score cannot be negative.',
        severity: 'error',
      });
    }
    if (match.status === 'PLAYED' && match.winnerSide === null) {
      issues.push({
        path: `${path}.winnerSide`,
        message: 'A played match must have a winner.',
        severity: 'error',
      });
    }
    if (match.boSeries <= 0) {
      issues.push({
        path: `${path}.boSeries`,
        message: 'Best-of must be a positive number.',
        severity: 'error',
      });
    }

    const sides = match.players.map((player) => player.side);
    if (sides.some((side) => side !== 1 && side !== 2)) {
      issues.push({
        path: `${path}.players`,
        message: 'Every match player must be assigned to side 1 or side 2.',
        severity: 'error',
      });
    }

    const gameNumbers = match.games.map((game) => game.gameNumber);
    if (new Set(gameNumbers).size !== gameNumbers.length) {
      issues.push({
        path: `${path}.games`,
        message: 'Game numbers must be unique within a match.',
        severity: 'error',
      });
    }
  });

  if (stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM') {
    const nullRound = stage.matches.findIndex((match) => match.round === null);
    if (nullRound !== -1) {
      issues.push({
        path: `stages[${stageIdx}].matches[${nullRound}].round`,
        message: 'Elimination matches require a round number.',
        severity: 'error',
      });
    }
    validateEliminationTopology(stage.matches, stageIdx, stage.name, issues);
  } else if (stage.bracketFormat === 'ROUND_ROBIN') {
    const nullRound = stage.matches.findIndex((match) => match.round === null);
    if (nullRound !== -1) {
      issues.push({
        path: `stages[${stageIdx}].matches[${nullRound}].round`,
        message: 'Round-robin matches require a round number.',
        severity: 'error',
      });
    }
  }
}

function validateEliminationTopology(
  matches: DraftEliminationMatch[],
  stageIdx: number,
  stageName: string,
  issues: ValidationIssue[],
): void {
  const byId = new Map(matches.map((m) => [m.id, m]));

  matches.forEach((match, matchIdx) => {
    const path = `stages[${stageIdx}].matches[${matchIdx}]`;

    if (match.winnerNextMatchId !== null) {
      const target = byId.get(match.winnerNextMatchId);
      if (!target) {
        issues.push({
          path: `${path}.winnerNextMatchId`,
          message: `Winner destination match does not exist in stage "${stageName}".`,
          severity: 'error',
        });
      } else if (match.winnerNextSide === null) {
        issues.push({
          path: `${path}.winnerNextSide`,
          message: 'Winner destination side is required when a destination match is set.',
          severity: 'error',
        });
      } else if (
        matches.some(
          (source) =>
            source.id !== match.id &&
            source.winnerNextMatchId === match.winnerNextMatchId &&
            source.winnerNextSide === match.winnerNextSide,
        )
      ) {
        issues.push({
          path: `${path}.winnerNextSide`,
          message: 'Multiple winner progression edges target the same destination slot.',
          severity: 'error',
        });
      }
    } else if (match.winnerNextSide !== null) {
      issues.push({
        path: `${path}.winnerNextSide`,
        message: 'Winner destination side cannot be set without a destination match.',
        severity: 'error',
      });
    }

    if (match.loserNextMatchId !== null) {
      const target = byId.get(match.loserNextMatchId);
      if (!target) {
        issues.push({
          path: `${path}.loserNextMatchId`,
          message: `Loser destination match does not exist in stage "${stageName}".`,
          severity: 'error',
        });
      } else if (match.loserNextSide === null) {
        issues.push({
          path: `${path}.loserNextSide`,
          message: 'Loser destination side is required when a destination match is set.',
          severity: 'error',
        });
      }
    } else if (match.loserNextSide !== null) {
      issues.push({
        path: `${path}.loserNextSide`,
        message: 'Loser destination side cannot be set without a destination match.',
        severity: 'error',
      });
    }

    if (match.section === 'LOSERS' && match.loserNextMatchId !== null) {
      issues.push({
        path: `${path}.loserNextMatchId`,
        message: 'A losers-bracket loss eliminates the participant and cannot advance.',
        severity: 'error',
      });
    }
  });

  const grandFinalExists = matches.some((match) => match.section === 'GRAND_FINAL');
  for (const [index, match] of matches.entries()) {
    if (match.section === 'GRAND_FINAL') continue;
    const laterInSection = matches.some(
      (candidate) =>
        candidate.section === match.section &&
        Math.abs(candidate.round ?? 0) > Math.abs(match.round ?? 0),
    );
    const feedsFinal =
      grandFinalExists && (match.section === 'WINNERS' || match.section === 'LOSERS');
    if ((laterInSection || feedsFinal) && match.winnerNextMatchId === null) {
      issues.push({
        path: `stages[${stageIdx}].matches[${index}].winnerNextMatchId`,
        message: 'Non-terminal elimination match requires a winner destination.',
        severity: 'error',
      });
    }
  }

  const cycleIssue = findProgressionCycle(matches);
  if (cycleIssue) {
    issues.push({
      path: `stages[${stageIdx}].matches`,
      message: `Progression cycle detected in stage "${stageName}": ${cycleIssue}.`,
      severity: 'error',
    });
  }
}

/** Walks winner/loser progression edges looking for a cycle. Returns a description if one is found. */
function findProgressionCycle(matches: DraftEliminationMatch[]): string | null {
  const byId = new Map(matches.map((m) => [m.id, m]));

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(match: DraftEliminationMatch): string | null {
    if (visiting.has(match.id)) return `match ${match.id} is part of a progression cycle`;
    if (visited.has(match.id)) return null;

    visiting.add(match.id);
    const destinations = [match.winnerNextMatchId, match.loserNextMatchId].filter(
      (id): id is string => id !== null,
    );
    for (const destination of destinations) {
      const target = byId.get(destination);
      if (!target) continue;
      const cycle = visit(target);
      if (cycle) return cycle;
    }

    visiting.delete(match.id);
    visited.add(match.id);
    return null;
  }

  for (const match of matches) {
    const cycle = visit(match);
    if (cycle) return cycle;
  }

  return null;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function isStaleDraftRevision(actualRevision: number, expectedRevision: number): boolean {
  return actualRevision !== expectedRevision;
}
