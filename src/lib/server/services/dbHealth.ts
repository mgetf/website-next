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
  throw new Error('getDbHealthSnapshot requires DATA_BACKEND=rama');
}
