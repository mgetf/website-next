import { TeamStatus } from '$prisma/client.js';

/** Prisma `_count.teams` filter so admin league totals ignore withdrawn/dead teams. */
export const LIVE_TEAM_COUNT = {
  where: { status: { not: TeamStatus.DEAD } },
} as const;
