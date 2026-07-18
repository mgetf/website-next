import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';
import { findEventInvariantFindings } from '../src/lib/utils/eventInvariants';

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

try {
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

  const findings = findEventInvariantFindings(stages);
  const summary = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.code] = (counts[finding.code] ?? 0) + 1;
    return counts;
  }, {});

  console.log(
    JSON.stringify(
      { stageCount: stages.length, findingCount: findings.length, summary, findings },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
