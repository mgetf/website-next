export type EventInvariantCode =
  | 'EMPTY_STAGE'
  | 'NULL_ELIMINATION_ROUND'
  | 'DUPLICATE_MATCH_ORDER'
  | 'MISSING_BRACKET_SECTION'
  | 'MISSING_PROGRESSION_TARGET'
  | 'INCOMPLETE_PLAYED_RESULT';

export interface EventInvariantFinding {
  code: EventInvariantCode;
  eventId: number;
  eventName: string;
  stageId: number;
  stageName: string;
  matchId: number | null;
  message: string;
}

export interface EventInvariantStage {
  id: number;
  name: string;
  bracketFormat: string;
  event: { id: number; name: string };
  matches: Array<{
    id: number;
    round: number | null;
    orderNum: number;
    label: string | null;
    status: string;
    winnerSide: number | null;
    section: string | null;
    winnerNextMatchId: number | null;
  }>;
}

export function findEventInvariantFindings(stages: EventInvariantStage[]): EventInvariantFinding[] {
  const findings: EventInvariantFinding[] = [];

  for (const stage of stages) {
    const base = {
      eventId: stage.event.id,
      eventName: stage.event.name,
      stageId: stage.id,
      stageName: stage.name,
    };

    if (stage.matches.length === 0) {
      findings.push({
        ...base,
        code: 'EMPTY_STAGE',
        matchId: null,
        message: 'Stage has no matches.',
      });
      continue;
    }

    const elimination =
      stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM';
    const orderCounts = new Map<string, number>();
    for (const match of stage.matches) {
      const normalizedLabel = (match.label ?? '').toLowerCase();
      const inferredSection = normalizedLabel.includes('grand final')
        ? 'GRAND_FINAL'
        : normalizedLabel.includes('losers')
          ? 'LOSERS'
          : normalizedLabel.includes('winners')
            ? 'WINNERS'
            : match.round === 0 || match.round === null
              ? 'GRAND_FINAL'
              : match.round > 0
                ? 'WINNERS'
                : 'LOSERS';
      const section =
        match.section ??
        (stage.bracketFormat === 'DOUBLE_ELIM' ? inferredSection : stage.bracketFormat);
      const position = `${section}:${match.round ?? 'none'}:${match.orderNum}`;
      orderCounts.set(position, (orderCounts.get(position) ?? 0) + 1);

      if (elimination && match.round === null) {
        findings.push({
          ...base,
          code: 'NULL_ELIMINATION_ROUND',
          matchId: match.id,
          message: 'Elimination match has no round number.',
        });
      }
      if (elimination && match.section === null) {
        findings.push({
          ...base,
          code: 'MISSING_BRACKET_SECTION',
          matchId: match.id,
          message: 'Elimination match has no explicit bracket section.',
        });
      }
      if (match.status === 'PLAYED' && match.winnerSide === null) {
        findings.push({
          ...base,
          code: 'INCOMPLETE_PLAYED_RESULT',
          matchId: match.id,
          message: 'Played match has no winner side.',
        });
      }
    }

    for (const [position, count] of orderCounts) {
      if (count > 1) {
        findings.push({
          ...base,
          code: 'DUPLICATE_MATCH_ORDER',
          matchId: null,
          message: `Match position ${position} is used ${count} times.`,
        });
      }
    }

    if (elimination) {
      const maxRound = Math.max(...stage.matches.map((match) => Math.abs(match.round ?? 0)));
      for (const match of stage.matches) {
        const isTerminal =
          match.section === 'GRAND_FINAL' ||
          (stage.bracketFormat === 'SINGLE_ELIM' && Math.abs(match.round ?? 0) === maxRound);
        if (!isTerminal && match.winnerNextMatchId === null) {
          findings.push({
            ...base,
            code: 'MISSING_PROGRESSION_TARGET',
            matchId: match.id,
            message: 'Non-terminal elimination match has no winner destination.',
          });
        }
      }
    }
  }

  return findings;
}
