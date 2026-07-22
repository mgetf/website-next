/**
 * Production Health Audit
 *
 * Connects directly to the production Postgres instance and produces a
 * structured report on connection usage, query health, and lock contention.
 *
 * Usage:
 *   $env:DBURL = "<connection string>"; bun run scripts/prod-health-audit.ts
 *
 * Or load from .env.production automatically:
 *   bun run --env-file .env.production scripts/prod-health-audit.ts
 *
 * Connection budget reference (as of May 2026):
 *   max_connections     = 100  (~97 usable; superuser_reserved = 3)
 *   website-next        = 2 replicas × (10 pool + 1 hub listener) = 22 steady-state
 *   deploy overlap      = 4 instances × 11 = 44
 *   sibling services    = ~23 at idle (mge-platform, bots, CRONs)
 *   steady-state total  ≈ 45 of 97  (safe)
 *   overlap total       ≈ 67 of 97  (safe, 30 headroom)
 *   danger zone         > 85 (< 12 from ceiling)
 */

import { Client } from 'pg';

const BUDGET = {
  maxConnections: 100,
  superuserReserved: 3,
  usable: 97,
  websiteNextSteadyState: 22, // 2 replicas × (10 pool + 1 hub)
  websiteNextOverlap: 44, // 4 instances × 11
  expectedSiblings: 23,
  dangerThreshold: 85,
  warningThreshold: 70,
};

const url = process.env.DATABASE_URL ?? process.env.DBURL;
if (!url) {
  console.error('ERROR: Set DATABASE_URL or DBURL before running this script.');
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const line = () => console.log('─'.repeat(70));
const head = (s: string) => {
  line();
  console.log(`  ${s}`);
  line();
};
const ok = (s: string) => console.log(`  ✓  ${s}`);
const warn = (s: string) => console.log(`  ⚠  ${s}`);
const fail = (s: string) => console.log(`  ✗  ${s}`);
const info = (s: string) => console.log(`     ${s}`);

// ── 1. Overview ──────────────────────────────────────────────────────────────

head('CONNECTION BUDGET');

const [maxConnRow] = (await client.query(`SHOW max_connections`)).rows;
const [reservedRow] = (await client.query(`SHOW superuser_reserved_connections`)).rows;
const maxConn = parseInt(maxConnRow.max_connections);
const reserved = parseInt(reservedRow.superuser_reserved_connections);
const usable = maxConn - reserved;

info(`max_connections: ${maxConn}  |  superuser_reserved: ${reserved}  |  usable: ${usable}`);

const totalRow = (
  await client.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`,
  )
).rows[0];
const total: number = totalRow.n;
const pct = ((total / usable) * 100).toFixed(1);

if (total >= BUDGET.dangerThreshold) {
  fail(`Total connections: ${total} / ${usable} usable (${pct}%) — DANGER ZONE`);
} else if (total >= BUDGET.warningThreshold) {
  warn(`Total connections: ${total} / ${usable} usable (${pct}%) — elevated`);
} else {
  ok(`Total connections: ${total} / ${usable} usable (${pct}%)`);
}

const websiteNextCount = (
  await client.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'website-next'`,
  )
).rows[0].n;

if (websiteNextCount > BUDGET.websiteNextOverlap) {
  fail(
    `website-next connections: ${websiteNextCount}  (expected ≤ ${BUDGET.websiteNextOverlap} at deploy overlap)`,
  );
} else if (websiteNextCount > BUDGET.websiteNextSteadyState) {
  warn(
    `website-next connections: ${websiteNextCount}  (above steady-state ${BUDGET.websiteNextSteadyState} — deploy in progress?)`,
  );
} else {
  ok(
    `website-next connections: ${websiteNextCount}  (steady-state budget: ${BUDGET.websiteNextSteadyState})`,
  );
}

// ── 2. By application name ────────────────────────────────────────────────────

head('CONNECTIONS BY APPLICATION');

const byApp = (
  await client.query(`
  SELECT
    coalesce(nullif(application_name, ''), '(none)') AS app,
    state,
    count(*)::int AS n
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY app, state
  ORDER BY n DESC, app
`)
).rows;

const appTotals: Record<string, number> = {};
for (const row of byApp) {
  appTotals[row.app] = (appTotals[row.app] ?? 0) + row.n;
}

for (const [app, total] of Object.entries(appTotals).sort((a, b) => b[1] - a[1])) {
  const breakdown = byApp
    .filter((r) => r.app === app)
    .map((r) => `${r.n} ${r.state ?? 'unknown'}`)
    .join(', ');
  info(`${app.padEnd(36)}  ${String(total).padStart(3)} total  (${breakdown})`);
}

// ── 3. Long-running queries ───────────────────────────────────────────────────

head('LONG-RUNNING QUERIES  (> 5 seconds)');

const longRunning = (
  await client.query(`
  SELECT
    pid,
    coalesce(nullif(application_name, ''), '(none)') AS app,
    state,
    wait_event_type,
    wait_event,
    round(extract(epoch from now() - query_start)::numeric, 1) AS duration_s,
    left(query, 120) AS query_snippet
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state != 'idle'
    AND query_start < now() - interval '5 seconds'
  ORDER BY duration_s DESC
  LIMIT 20
`)
).rows;

if (longRunning.length === 0) {
  ok('No long-running queries detected.');
} else {
  warn(`${longRunning.length} long-running query(ies) found:`);
  for (const row of longRunning) {
    info(`  pid=${row.pid}  app=${row.app}  state=${row.state}  duration=${row.duration_s}s`);
    if (row.wait_event) info(`    waiting on: ${row.wait_event_type}/${row.wait_event}`);
    info(`    ${row.query_snippet}`);
  }
}

// ── 4. Lock waits ─────────────────────────────────────────────────────────────

head('LOCK WAITS');

const lockWaits = (
  await client.query(`
  SELECT
    blocked.pid                    AS blocked_pid,
    blocked.application_name       AS blocked_app,
    round(extract(epoch from now() - blocked.query_start)::numeric, 1) AS blocked_for_s,
    blocking.pid                   AS blocking_pid,
    blocking.application_name      AS blocking_app,
    left(blocked.query, 100)       AS blocked_query
  FROM pg_stat_activity AS blocked
  JOIN pg_stat_activity AS blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
  WHERE blocked.wait_event_type = 'Lock'
  ORDER BY blocked_for_s DESC
  LIMIT 10
`)
).rows;

if (lockWaits.length === 0) {
  ok('No lock waits detected.');
} else {
  fail(`${lockWaits.length} lock wait(s) detected:`);
  for (const row of lockWaits) {
    info(
      `  pid=${row.blocked_pid} (${row.blocked_app}) blocked for ${row.blocked_for_s}s by pid=${row.blocking_pid} (${row.blocking_app})`,
    );
    info(`    ${row.blocked_query}`);
  }
}

// ── 5. Idle-in-transaction connections ────────────────────────────────────────

head('IDLE-IN-TRANSACTION  (connection leak indicator, > 30 seconds)');

const idleInTx = (
  await client.query(`
  SELECT
    pid,
    coalesce(nullif(application_name, ''), '(none)') AS app,
    round(extract(epoch from now() - state_change)::numeric, 0) AS idle_tx_s,
    left(query, 100) AS last_query
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state = 'idle in transaction'
    AND state_change < now() - interval '30 seconds'
  ORDER BY idle_tx_s DESC
  LIMIT 10
`)
).rows;

if (idleInTx.length === 0) {
  ok('No long idle-in-transaction connections detected.');
} else {
  fail(`${idleInTx.length} idle-in-transaction connection(s) > 30 s — possible leak:`);
  for (const row of idleInTx) {
    info(`  pid=${row.pid}  app=${row.app}  idle for ${row.idle_tx_s}s`);
    info(`    last query: ${row.last_query}`);
  }
}

// ── 6. website-next connection detail ─────────────────────────────────────────

head('WEBSITE-NEXT CONNECTION DETAIL');

const hubConnections = (
  await client.query(`
  SELECT pid, state, wait_event_type, wait_event
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND application_name = 'website-next'
  ORDER BY state, pid
`)
).rows;

info(`Connections held by website-next: ${hubConnections.length}`);
for (const row of hubConnections) {
  const wait = row.wait_event ? ` waiting=${row.wait_event_type}/${row.wait_event}` : '';
  info(`  pid=${String(row.pid).padEnd(7)}  state=${(row.state ?? '').padEnd(20)}${wait}`);
}

// Hub listener connections show up as ClientRead wait (waiting for a NOTIFY from Postgres).
// Pool connections idle between requests show up as state=idle.
const hubListeners = hubConnections.filter(
  (r) => r.wait_event === 'ClientRead' || r.wait_event === 'Message',
);
const poolIdle = hubConnections.filter((r) => r.state === 'idle');
const poolActive = hubConnections.filter((r) => r.state === 'active');

info('');
info(
  `  Hub listener connections (ClientRead/Message): ${hubListeners.length}  (expect 2 — one per replica)`,
);
info(`  Pool idle:   ${poolIdle.length}`);
info(`  Pool active: ${poolActive.length}`);

if (hubConnections.length <= BUDGET.websiteNextSteadyState) {
  ok(`Total within steady-state budget (≤ ${BUDGET.websiteNextSteadyState})`);
} else {
  warn(`Above steady-state — deploy overlap in progress, or pool is not draining`);
}

// ── 7. Summary ────────────────────────────────────────────────────────────────

head('SUMMARY');

const issues: string[] = [];
if (total >= BUDGET.dangerThreshold) issues.push(`Total connections critical: ${total}/${usable}`);
if (websiteNextCount > BUDGET.websiteNextOverlap)
  issues.push(`website-next connections over deploy-overlap budget: ${websiteNextCount}`);
if (longRunning.length > 0) issues.push(`${longRunning.length} long-running query(ies) > 5s`);
if (lockWaits.length > 0) issues.push(`${lockWaits.length} lock wait(s)`);
if (idleInTx.length > 0) issues.push(`${idleInTx.length} idle-in-transaction connection(s) > 30s`);

if (issues.length === 0) {
  ok('All checks passed. Production looks healthy.');
  ok(`Connection headroom: ${usable - total} of ${usable} usable slots free`);
} else {
  fail(`${issues.length} issue(s) found:`);
  for (const issue of issues) {
    fail(`  • ${issue}`);
  }
}

info('');
info(`Checked at: ${new Date().toISOString()}`);
line();

await client.end();
