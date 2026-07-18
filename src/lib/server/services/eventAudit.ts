import { prisma } from '$lib/server/db';
import { findEventInvariantFindings, type EventInvariantFinding } from '$lib/utils/eventInvariants';

export type { EventInvariantCode, EventInvariantFinding } from '$lib/utils/eventInvariants';

export async function auditPublishedEventInvariants(): Promise<EventInvariantFinding[]> {
  const stages = await prisma.eventStage.findMany({
    include: {
      event: { select: { id: true, name: true } },
      matches: {
        orderBy: [{ round: 'asc' }, { orderNum: 'asc' }],
        select: {
          id: true,
          round: true,
          orderNum: true,
          label: true,
          status: true,
          winnerSide: true,
          section: true,
          winnerNextMatchId: true,
        },
      },
    },
    orderBy: [{ eventId: 'asc' }, { orderNum: 'asc' }],
  });

  return findEventInvariantFindings(stages) as EventInvariantFinding[];
}
