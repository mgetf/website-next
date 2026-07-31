# Rama Spike — Match Module over REST JSON

See [`rama/README.md`](../rama/README.md) for the full write-up.

**Transit:** TypeScript → Rama built-in REST (JSON depot append + JSON paths). No gRPC. No Clojure HTTP server.

**Module:** `mge.tf.rama.match-module/MatchModule`  
**Client:** `src/lib/server/rama/client.ts` + `match.ts`  
**Tests:** `cd rama && lein test-rama`  
**Smoke:** `bun run rama:smoke` (needs live cluster)
