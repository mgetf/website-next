import { prisma } from '$lib/server/db';

type ConnectionSummaryRow = {
  maxConnections: number;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  idleInTransactionConnections: number;
};

type OldestTransactionRow = {
  oldestTransactionAgeSeconds: number | null;
};

type LockWaiterRow = {
  lockWaiters: number;
};

export async function getDbHealthSnapshot() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    return {
      capturedAt: new Date().toISOString(),
      maxConnections: 0,
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      idleInTransactionConnections: 0,
      oldestTransactionAgeSeconds: 0,
      lockWaiters: 0,
      backend: 'rama' as const,
    };
  }

  const [connectionSummary] = await prisma.$queryRaw<ConnectionSummaryRow[]>`
    SELECT
      current_setting('max_connections')::int AS "maxConnections",
      COUNT(*)::int AS "totalConnections",
      COUNT(*) FILTER (WHERE state = 'active')::int AS "activeConnections",
      COUNT(*) FILTER (WHERE state = 'idle')::int AS "idleConnections",
      COUNT(*) FILTER (WHERE state = 'idle in transaction')::int AS "idleInTransactionConnections"
    FROM pg_stat_activity
    WHERE datname = current_database();
  `;

  const [oldestTransaction] = await prisma.$queryRaw<OldestTransactionRow[]>`
    SELECT
      COALESCE(MAX(EXTRACT(EPOCH FROM (now() - xact_start)))::int, 0) AS "oldestTransactionAgeSeconds"
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start IS NOT NULL;
  `;

  const [lockWaiters] = await prisma.$queryRaw<LockWaiterRow[]>`
    SELECT COUNT(*)::int AS "lockWaiters"
    FROM pg_locks
    WHERE NOT granted;
  `;

  return {
    capturedAt: new Date().toISOString(),
    maxConnections: connectionSummary?.maxConnections ?? 0,
    totalConnections: connectionSummary?.totalConnections ?? 0,
    activeConnections: connectionSummary?.activeConnections ?? 0,
    idleConnections: connectionSummary?.idleConnections ?? 0,
    idleInTransactionConnections: connectionSummary?.idleInTransactionConnections ?? 0,
    oldestTransactionAgeSeconds: oldestTransaction?.oldestTransactionAgeSeconds ?? 0,
    lockWaiters: lockWaiters?.lockWaiters ?? 0,
  };
}
