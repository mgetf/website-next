# RFC: Real-Time Notifications & Database Connection Resilience

**Author:** Development Team
**Date:** May 30, 2026
**Status:** 📋 Proposed

---

## Summary

The production site fails catastrophically under load. The failure floods the logs with `prisma:error timeout exceeded when trying to connect` originating from `/api/notifications/stream`, and takes the **entire site** down — not just notifications.

The root cause is architectural, not a tuning problem: the notification system is built on **per-client database polling**, and **every HTTP request synchronously depends on the database** via the session hook. Both make physical connection demand scale with traffic against a fixed pool of 20 connections. No amount of backoff/jitter tuning (already attempted multiple times) changes that scaling law — it only moves the cliff.

This RFC proposes inverting the model from **"every client pulls from Postgres"** to **"Postgres pushes once; the app fans out from memory"**, plus removing the per-request DB dependency and bounding the connection pool. The result: database connection demand becomes a function of `replicas`, not of `connected_users`.

The work is broken into **independently shippable phases**, each with an explicit validation gate. This phasing is deliberate — prior fixes failed precisely because they were one-shot symptom patches shipped without per-layer validation. Note: this is **not** gated behind a poll-vs-push feature flag — the current polling design is the thing actively taking the site down, so there is nothing worth "falling back" to. We replace it directly and delete it, keeping only a lightweight kill switch that degrades to static notifications (see Rollback Strategy).

---

## Background

### The current architecture

**Notifications (`pull, per-client, synchronous`):**

Every logged-in browser tab opens an `EventSource` to `/api/notifications/stream` (`src/lib/state/notifications.svelte.ts`). Each connection independently queries Postgres on a 15–60s timer (`src/routes/api/notifications/stream/+server.ts`):

```
poll() → getNotificationsSinceId(userSteamId, lastId) → setTimeout(poll, delay)
```

Steady-state DB read load ≈ `O(connected_users / poll_interval)`. With dozens of concurrent users (the failing log shows ~60+ distinct steam IDs within a few seconds), aggregate demand exceeds the pool.

**Sessions (`synchronous, every request`):**

`src/hooks.server.ts` runs `getSessionVersion(user.steamId)` — a DB query — on **every single request** for any logged-in user. This means the database is a hard dependency for rendering _anything_.

**Connection pool (fixed, per-process):**

```
// src/lib/server/db.ts
new PrismaPg({ connectionString, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
```

### The cascade

1. A load spike (match night) pushes concurrent DB demand past the 20-connection pool.
2. `connectionTimeoutMillis: 5000` means each waiter **holds a queue slot for a full 5 seconds** before failing. Under saturation, effective throughput collapses to ~4 acquisitions/sec.
3. Because the session hook needs a connection on every request, **all** requests start failing — the outage is global, not scoped to notifications.
4. Failing SSE streams retry on a 60s-capped backoff; the thundering herd keeps the pool saturated. The outage becomes **self-sustaining** and does not recover on its own.

### Why prior fixes did not work

| Commit                | Date   | What it did                                           | Why it wasn't enough                           |
| --------------------- | ------ | ----------------------------------------------------- | ---------------------------------------------- |
| `9395b07`             | Jan 30 | Built the polling-SSE notification system             | This _is_ the root design                      |
| `c2fc743` / `567e606` | Apr 6  | Pool config, `dbHealth`, idle backoff                 | Tuned average load, not the scaling law        |
| `5c055b1`             | May 26 | Jitter, error/idle backoff, tab-visibility disconnect | Raised the threshold; did not remove the cliff |

Every prior fix reduced _average_ polling load. That is why the site works most of the time and then fails catastrophically at peak. The scaling property (`load ∝ users`) and the global DB dependency were never addressed.

### Indexes are not the problem

The `Notification` model already has `@@index([userSteamId, id])`, which fully covers the polling queries (`getNotificationsSinceId`, `getLatestNotificationId`). This is purely a connection-concurrency problem, not query tuning.

---

## Goals

1. **Break the `O(users)` scaling.** Notification delivery must not generate database load proportional to the number of connected clients.
2. **Remove the per-request DB dependency** so a database hiccup degrades a single feature instead of taking down the whole site.
3. **Bound physical connections** so total demand is `replicas × max ≤ Postgres max_connections`, and fail fast instead of building a self-sustaining timeout queue.
4. **Ship safely and incrementally**, validating each layer on staging before production, with a kill switch that degrades to static notifications (never back to the broken polling path) and Railway deploy-rollback as the "everything is on fire" escape hatch.

## Non-Goals

- Changing the notification _data model_, the dropdown UI, or the read/unread semantics.
- Introducing an external realtime provider (Ably/Pusher/Supabase). Considered below as an alternative, but explicitly out of scope — the goal is to stay within the existing SvelteKit + Bun + Postgres stack.
- Rewriting unrelated services.

---

## Proposed Design

Pivot from **pull** to **push**, using Postgres `LISTEN/NOTIFY` with a **single listener connection per replica** and a **process-local in-memory fan-out hub**.

### High-level flow

```
                         (one dedicated pg connection per replica)
 Mutation                         │ LISTEN "notifications"
 createNotificationForX()         ▼
   │ INSERT notification     ┌─────────────┐      in-memory       ┌──────────────┐
   └── pg_notify('notif', ─▶ │  Listener   │ ───── emit ────────▶ │  Hub         │
        payload)             │  (1 conn)   │                      │ (subscribers │
                             └─────────────┘                      │  by steamId) │
                                                                  └──────┬───────┘
                                                                         │ fan-out
                                              ┌──────────────────────────┼───────────────┐
                                              ▼                          ▼               ▼
                                         SSE stream A             SSE stream B      SSE stream C
                                       (no DB polling)          (no DB polling)   (no DB polling)
```

After connect, SSE streams are **pure in-memory subscribers** — they never query Postgres again. Steady-state notification DB _reads_ drop to **zero**.

`LISTEN/NOTIFY` is **replica-safe**: every replica's listener receives every `NOTIFY`, and fans out to the clients connected to _that_ replica. Connection cost for realtime becomes `replicas × 1 listener`, regardless of how many users are online.

### Component 1 — Dedicated listener + in-memory hub

A new server module (e.g. `src/lib/server/realtime/notificationHub.ts`) owns:

- A **raw `pg` Client** (not the Prisma pool) dedicated to `LISTEN "notifications"`. It must be a separate physical connection because a `LISTEN` connection is long-lived and must not be checked out of / returned to the query pool.
- A **subscriber registry**: `Map<steamId, Set<subscriber>>`.
- **Reconnection with catch-up** (see Failure Modes).

```
// illustrative shape
hub.subscribe(steamId, (notification) => safeEnqueue(notification)); // returns unsubscribe
// listener:
client.on('notification', (msg) => {
  const payload = JSON.parse(msg.payload);
  hub.deliver(payload.userSteamId, payload);
});
```

### Component 2 — Emit on write

Every notification-creating function in `src/lib/server/services/notifications.ts` (`createNotificationForUser`, `...ForMatch`, `...ForTeam`, `...ForTeamOwners`, `...ForAdmins`) must, after a successful insert, issue a `pg_notify`. Because several of these do bulk `createMany`, the emit step needs the inserted rows (or at least recipient steam IDs + ids) to construct payloads. This is the main service-layer change.

### Component 3 — SSE route becomes a subscriber

`src/routes/api/notifications/stream/+server.ts` is rewritten to:

1. Subscribe to the hub **first** (before reading the DB) to avoid the subscribe-before-load race.
2. Do **one** initial `getNotificationsSinceId` for backfill.
3. Stream events from the hub. Keep only a lightweight heartbeat timer (no DB calls).
4. Unsubscribe cleanly in `cancel()`.

This **replaces** the polling loop outright — the old `poll()`/backoff/jitter logic is deleted in the same change, not kept as a parallel path. A single kill switch (`REALTIME_NOTIFICATIONS_ENABLED`, default `true`) is the only conditional: when off, the endpoint returns immediately (or the client skips opening the `EventSource`) and notifications degrade to **static** — they still load on page load via the layout, users just don't get live updates until they refresh. This puts zero recurring load on the DB and is the graceful-degradation fallback, _not_ a return to polling.

### Component 4 — Session decoupling (separate phase)

Cache `sessionVersion` lookups so the hook does not hit Postgres on every request. Options to decide in Phase 2:

- In-memory TTL cache (simplest; per-replica; staleness bounded by TTL), **or**
- Invalidate-on-change via the same `NOTIFY` channel (a `session:<steamId>` signal bumps the cache).

> **Security note:** Bans and permission revocations rely on `sessionVersion` bumps taking effect. The TTL/invalidation strategy must keep propagation fast (target: ≤ a few seconds). This is why session decoupling is its own phase (Phase 2) with its own review — a wrong TTL is a security regression, not a perf one.

### Component 5 — Pooler & pool sizing (separate phase)

- Front the database with **PgBouncer** (or Railway's managed pooler) so physical Postgres connections are bounded independent of app-pool churn.
- Set `DB_POOL_MAX` such that `replicas × DB_POOL_MAX ≤ Postgres max_connections` with headroom.
- Lower `connectionTimeoutMillis` (e.g. 5000 → ~2000) so a spike fails fast rather than building the self-sustaining queue.

---

## Key Design Decisions (forks to resolve in Phase 0)

1. **NOTIFY payload: full notification vs. ID-only.**
   `pg_notify` has an **8000-byte payload limit**. Options:
   - **Full payload** (recommended): serialize the notification (incl. actor fields) into the NOTIFY. Zero DB reads on delivery. Risk: oversized payloads must be guarded (truncate/fallback).
   - **ID-only**: NOTIFY carries just `{ userSteamId, id }`; the stream fetches the row. Simpler payloads but reintroduces a DB read per notification (acceptable because it scales with _events_, not _connected users_ — still `O(events)`, not `O(users × polls)`).
   - **Decision driver:** notification payloads here are small (message + url + actor summary), so full payload is almost certainly safe. Confirm max size against real data in Phase 0.

2. **Multi-replica fan-out:** Confirmed handled natively by `LISTEN/NOTIFY` (each replica listens). No cross-replica message bus needed. _Unless_ topology changes drastically, no Redis is required.

3. **Session cache strategy:** TTL vs. NOTIFY-invalidation — decided in Phase 2.

---

## Failure Modes & Handling

These are the parts that bite in production and that justify careful, gated phasing.

| Failure mode                                                     | Consequence if ignored                                                 | Handling                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Listener connection drops** (deploy, network blip, PG restart) | All realtime delivery silently stops                                   | Auto-reconnect with backoff; health check; on reconnect, **catch up** (see below)                                                       |
| **Missed NOTIFY during a drop**                                  | Notifications fired in the gap are lost forever                        | On (re)connect, each active stream re-runs `getNotificationsSinceId(lastSeenId)` to backfill the gap                                    |
| **Subscribe-before-load race**                                   | A notification firing between initial load and subscription is dropped | Subscribe to the hub **before** reading `getLatestNotificationId`; de-dupe by id                                                        |
| **Payload exceeds 8KB**                                          | `pg_notify` errors, insert path may fail                               | Guard payload size; fall back to ID-only for that message; never let notify failure break the mutation (emit in try/catch, post-commit) |
| **Stale session cache**                                          | Banned/demoted user retains access                                     | Bounded TTL and/or NOTIFY-invalidation; explicit propagation test in Phase 2                                                            |
| **Zombie subscribers**                                           | Memory growth from streams that never unsubscribed                     | `cancel()` + heartbeat-detected dead connections remove subscribers; periodic sweep                                                     |

---

## Phased Rollout Plan

Each phase is independently shippable and has a concrete, measurable validation gate. `/api/admin/db-health` (`getDbHealthSnapshot`) already exposes `totalConnections`, `activeConnections`, and `maxConnections` — it is the primary before/after instrument.

### Phase 0 — Confirm topology & resolve forks ✅

**Goal:** Remove unknowns before writing code.

**Findings (May 30, 2026, live production topology):**

| Fact                         | Value                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `website-next` replicas      | **1** (`numReplicas` unset = default)                                                                                                                                                                |
| Pooler in front of Postgres? | **No** — direct connection, no pgbouncer/proxy in front of Postgres                                                                                                                                   |
| `DB_POOL_MAX`                | **Unset** → defaults to **20** per process (`src/lib/server/db.ts`)                                                                                                                                  |
| Postgres `max_connections`   | **100** (`superuser_reserved_connections` = 3 → ~**97** usable)                                                                                                                                      |
| Connections at idle (Sat)    | **24** on this DB / 29 server-wide; **23 idle, 1 active**                                                                                                                                            |
| Connection holders           | Two other processes hold **13** and **10** connections at rest — i.e. multiple services keep pools open even when idle                                                                              |
| Shared cluster               | The Postgres instance is also reachable by several other internal services — the 97-connection budget is **shared** across the deployment, not exclusive to `website-next`                          |

**Critical implication — the real ceiling is ~97 shared connections, not 20.** `"timeout exceeded when trying to connect"` is node-postgres failing to **establish a new physical connection**. This happens when Postgres is at/near `max_connections`: the combined pools of `website-next` (up to 20) + other internal services + the deploy-overlap window (the platform runs old + new instance simultaneously, briefly doubling `website-next` to ~40) push the server past 97. At that point _every_ service's new-connection attempts stall and time out — which is exactly why the outage is global and self-sustaining. **23 idle connections are already held at near-zero traffic**, so the headroom is thinner than it looks.

**Forks resolved:**

- **Full-payload NOTIFY.** Notification rows are small (message + url + actor summary, well under the 8 KB `pg_notify` limit). Guard size and fall back to ID-only per message if ever exceeded.
- **Session cache:** start with a short-TTL in-memory cache (single replica makes this trivially consistent); revisit NOTIFY-invalidation only if the ban-propagation window proves too slow.
- **Pooler (Phase 3) is warranted but not urgent for `website-next` alone** (1 replica × 20). The higher-value Phase 3 actions are: set an explicit, conservative `DB_POOL_MAX`, lower `connectionTimeoutMillis`, set a per-service `application_name` for observability, and — because the cluster is shared — audit the sibling services' pool sizes against the 97 ceiling.

**Gate:** ✅ Topology documented; forks decided.

### Phase 1 — Replace polling with push (the load-breaking change)

**Goal:** Build the listener + in-memory hub and switch the SSE route to it in one reviewed unit, deleting the polling path. This is the change that ends the catastrophic outages.

- New `notificationHub.ts` with dedicated `pg` client, `LISTEN`, reconnect + catch-up.
- `pg_notify` emitted from the notification service write paths.
- Rewrite `/api/notifications/stream` to subscribe-then-backfill-then-stream; **delete** the old `poll()`/backoff/jitter logic.
- Add the `REALTIME_NOTIFICATIONS_ENABLED` kill switch (default `true`) that degrades to static notifications when off.
- **Validate on staging (`dev.mge.tf`) first**, then ship straight to production.

**Gates:**

1. Force-drop the listener connection; confirm it reconnects and that a notification fired during the drop is delivered via catch-up. Listener holds exactly one extra connection per process.
2. Under a load test reproducing peak concurrency, `db-health` shows **flat connection usage** as connected clients increase (vs. the current linear growth). Multi-tab, logout, and reconnect all behave. Steady-state notification reads ≈ 0.
3. Kill switch verified: setting `REALTIME_NOTIFICATIONS_ENABLED=false` cleanly degrades to static notifications with no DB polling.

> Phase 1 alone is expected to end the catastrophic outages. Phases 2–3 are durability hardening.

### Phase 2 — Decouple session check from every request

**Goal:** Remove the per-request DB dependency in the hook.

- Cache `sessionVersion` per the Phase 0 decision (short-TTL in-memory to start).
  **Gate:** Page rendering no longer issues a `user` query per request (verify via query logging / `db-health` under navigation load). **Ban/permission-revocation propagation test passes** within the target window. This phase gets its own dedicated review.

### Phase 3 — Pool sizing & fail-fast tuning

**Goal:** Bound physical connections and make spikes degrade gracefully.

- Set an explicit, conservative `DB_POOL_MAX` against the shared `replicas × max ≤ ~97` budget; lower `connectionTimeoutMillis` (e.g. 5000 → ~2000); set a per-service `application_name` for observability.
- Audit other internal services' pool sizes against the shared 97-connection ceiling.
- Introduce PgBouncer / Railway pooler only if the shared budget proves too tight after the audit.
  **Gate:** Connection count stays under the Postgres ceiling under stress; an induced overload returns fast errors and **recovers automatically** instead of cascading.

---

## Rollback Strategy

We deliberately do **not** keep the polling path as a fallback — rolling back to it means rolling back to the outage. Instead there are two independent, layered safety mechanisms:

1. **Kill switch (graceful degradation).** `REALTIME_NOTIFICATIONS_ENABLED=false` disables live updates and falls back to **static** notifications (loaded on page render, refreshed on navigation). This protects against a _silent_ push failure (e.g. a listener that stops delivering) without any recurring DB load and without a redeploy — it's an env-var flip. This is the first response if push misbehaves while we debug.
2. **Railway deploy rollback (full revert).** For an "everything is on fire" regression, Railway retains prior deployments and can instantly roll back the entire deploy. This is the escape hatch for a catastrophic, unforeseen failure in the new code.

- Phase 2 (session cache) ships behind its own toggle so the per-request lookup can be restored independently.
- Phase 3 (pool tuning) is reversible by restoring the previous pool settings.
- The polling code is deleted in Phase 1 — git history + Railway deploy rollback are the recovery path, not a live parallel code path.

---

## Alternative Considered: Managed Realtime Provider

Offloading realtime to **Ably / Pusher / Supabase Realtime / a Redis pub-sub tier** would remove long-lived connections and polling from our servers entirely — clients subscribe to the provider; the backend only publishes.

**Why not (for now):** It introduces a new external dependency and cost, and the `LISTEN/NOTIFY` + in-memory hub approach achieves the core goal (breaking `O(users)` scaling) with **zero new infrastructure** on the existing stack. Revisit only if we outgrow single-Postgres fan-out (e.g., very high replica counts or cross-region).

---

## Execution Notes

- Each phase should be executed (and re-planned in detail) in its **own focused Cursor Plan session**. This document provides the sequencing, validation gates, and rollback story; the per-phase Plan session provides the line-level implementation plan.
- Adhere to existing conventions: DB access stays in services (`src/lib/server/services/`), the hub lives under `src/lib/server/`, the client boundary is respected (no `$lib/server` imports in `.svelte`/state files).
- Update this RFC's Status as phases complete, mirroring the convention used by other proposals in this folder.

---

## Open Questions

1. ~~Production replica count and Postgres `max_connections`?~~ **Resolved (Phase 0):** 1 replica, `max_connections` = 100 (~97 usable), no pooler, shared cluster. See Phase 0 findings.
2. ~~Full-payload vs ID-only NOTIFY?~~ **Resolved:** full-payload (small rows, well under 8 KB), with size guard + ID-only fallback.
3. ~~Session cache: TTL vs NOTIFY-invalidation?~~ **Resolved (direction):** short-TTL in-memory to start; the acceptable ban-propagation window still needs a product decision in Phase 2.
4. ~~Is PgBouncer warranted immediately?~~ **Resolved:** deferrable for `website-next` (1 replica). Open follow-up: **which sibling services connect to `postgres-website`, and what are their pool sizes?** The 97-connection budget is shared, so this should be audited as part of Phase 3.
