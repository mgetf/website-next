# Rama Spike — Modules over REST JSON

See [`rama/README.md`](../rama/README.md) for the full write-up.

**Transit:** TypeScript → Rama built-in REST (JSON depot append + JSON paths). No gRPC. No Clojure HTTP server.

| Module                | Client                                 | Topology ack key |
| --------------------- | -------------------------------------- | ---------------- |
| `MatchModule`         | `src/lib/server/rama/match.ts`         | `matches`        |
| `UsersModule`         | `src/lib/server/rama/users.ts`         | `users`          |
| `TeamsModule`         | `src/lib/server/rama/teams.ts`         | `teams`          |
| `PaymentsModule`      | `src/lib/server/rama/payments.ts`      | `payments`       |
| `NotificationsModule` | `src/lib/server/rama/notifications.ts` | `notifications`  |
| `SeasonsModule`       | `src/lib/server/rama/seasons.ts`       | `seasons`        |

**Tests:** `cd rama && lein test-rama`  
**Smoke:** `bun run rama:smoke` (needs live cluster with all modules launched)
