# RFC: In-Game League Match Coordinator

**Author:** Maxi + Cursor
**Date:** September 11, 2026
**Status:** Draft — brainstorm, iterate before implementing
**Related:**

- `[league-player-experience.md](league-player-experience.md)` (this was deferred there as “automatic match coordination”)
- `[bracket-rendering.md](bracket-rendering.md)` (live tournament orchestration: `Game Server → Orchestration Engine → API/SSE`)
- `[format-system.md](format-system.md)` (1v1 / 2v2 / Ultiduo / BBall as Format rows)
- `[realtime-notifications.md](realtime-notifications.md)`
- MGEMod public API: `addons/sourcemod/scripting/include/mge.inc` (forwards + natives)
- Website logs: `MatchLog` + `POST /api/v1/logs/upload`
- Log collector: `mge-logs` (`docs/rfc-001-mge-match-logging.md`) — **must** grow pause/resume (D34)
- Log parser: `mge-logs-parser` — one parse for a paused-then-finished file

This is a working document. **Locked decisions** are the ones we already answered. Remaining knobs live in **Open decisions**. Nothing is scheduled until the RFC settles.

### Locked so far (2026-09-11)

| ID  | Decision                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2  | Coordinator is its **own repo from day one**. It consumes `mge.inc`. It does not live inside MGEMod.                                                                                                                                                                                                                                                                                                          |
| D4  | **Join menu**, never silent teleport. Also shown the moment the opponent (or teammate) **connects** to the server where the claim is waiting — they do not have to type `!league` first.                                                                                                                                                                                                                      |
| D9  | Reconnect window before forfeit: **180 seconds**.                                                                                                                                                                                                                                                                                                                                                             |
| D11 | Disconnect does **not** end the league session. Score stays frozen. After rejoin, both sides ready again (D21), then continue at those frozen numbers.                                                                                                                                                                                                                                                        |
| D14 | **Any active roster member** can claim/start. Only active roster Steam IDs may enter the reserved arena.                                                                                                                                                                                                                                                                                                      |
| D1  | **No `MatchSession` table.** Expired claims are not a history we care about. `CLAIMED` / `LIVE` live on `Match`. Live server fields on the row are cleared when the claim dies.                                                                                                                                                                                                                               |
| D21 | After a LIVE disconnect and rejoin: **ask both players ready again**. If both Yes, resume at the score from **before** the leaver left. Not 0–0.                                                                                                                                                                                                                                                              |
| D22 | Arena is in match mode from the moment the starter is **in that arena after a claim**, until nobody owns a claim there. A 180s reconnect wait is still match mode — no random `!add`.                                                                                                                                                                                                                         |
| D23 | Join-menu **No**: do not re-prompt until they type `!league`. Notify whoever is waiting: the rival chose not to play right now.                                                                                                                                                                                                                                                                               |
| D24 | While an arena is **managed** (D31), MGEMod must **not** auto-run `Timer_StartDuel` (the pug “two slots filled → 0–0 → countdown”). First fill and post-disconnect rejoin both hit that path. The coordinator starts the fight when both ready.                                                                                                                                                               |
| D26 | While managed, MGEMod must **not** run the public early-leave forfeit (`early_leave_threshold` is typically `3` on training maps). A 14–11 disconnect must not become a pug win, must not write Glicko, must not fire `On1v1MatchEnd`. Slot still vacates.                                                                                                                                                    |
| D27 | The 180s clock is **until they rejoin this server**. Once the leaver occupies the reserved slot again, cancel 180s and start the post-disconnect ready check (D21 / D25). Rejoining at T+170s must not forfeit while they are answering ready.                                                                                                                                                                |
| D25 | After a LIVE disconnect, ready again: if one player says **No**, warn that this is a forfeit win for the other, then forfeit. If **both** say No (or neither says Yes before timeout), **abort** the fixture back to `UNPLAYED`. No forfeit.                                                                                                                                                                  |
| D28 | Any roster member may **abort** while still `CLAIMED` (not yet counting). Once `LIVE`, no abort command — disconnect / forfeit only.                                                                                                                                                                                                                                                                          |
| D30 | Both players disconnect and **neither** returns inside 180s (shared ISP drop, etc.): abort to `UNPLAYED`. No forfeit. Nobody caused it.                                                                                                                                                                                                                                                                       |
| D31 | Agnostic **managed arena** on MGEMod (working name `MGE_SetArenaManaged`). Any plugin can take an arena. Public MGE behaviour stays default. Managed = skip auto-start, skip early-leave forfeit, skip queue rotate on leave and on last frag, refuse player `!add` into that arena (queue included). Natives still add the people the managing plugin chose. Not named Lock / Hold / League.                 |
| D32 | On LIVE disconnect, coordinator takes a **snapshot** before the leaver is gone: arena score + each participant’s health, origin (x,y,z), eye angles, velocity (they may be in the air). The remaining player stays in the arena and can keep shooting at nothing. After both ready, restore that snapshot (not a fresh spawn at 0–0). `StartCountDown` today calls `ResetPlayer` — resume must not wipe this. |
| D33 | **Never** interrupt an active fight, public or official, to start a league match. If the target arena is mid-pug, or the map is wrong, or every matching arena is busy: bounce. Message: no free arena for this match. Taking an **idle** arena that only has people waiting in queue is not interrupting a fight; tell those waiters this arena is reserved.                                                 |
| D34 | League logs are **one file**. Disconnect mid-official must **pause** the `mge_logs` session, not abort it. Resume appends to the same session. Upload once when the official fight actually ends. Change `mge-logs` + parser; see Logs below.                                                                                                                                                                 |
| D35 | The coordinator only drives sessions **it started**. It does not listen to pug `On1v1MatchEnd` on other arenas.                                                                                                                                                                                                                                                                                               |

---

## Product goal

A registered, paid league player should be able to walk onto an **official mge.tf server**, run a command, pick a pending match from a menu, and play it **in the correct arena, under the correct rules**. Teammates and opponents on that server (or who connect later) get a **join menu** — they are never silently teleported.

When both sides confirm ready, the match is **official**. When it ends, the plugin reports the result to the website as the official score, attributed to the coordinator plugin (name + version). The matching MGE log is linked to that league match.

The website is the **fixture book** (who plays whom, rules, roster) and the **ledger** (it writes what the plugin reports). The plugin on the game server **owns the live fight**. Players should not need a match ID, a spreadsheet, or a staff member in voice to start the week.

---

## Why now

Today the loop is:

1. Staff generate the week → match exists as `UNPLAYED`.
2. Players find `/matches/[id]` (or get a notification, after league-player-experience Phase 1).
3. They agree a time in match comms / Discord.
4. They meet on a public MGE server, `!add` the right arena, play first-to-N, screenshot / trust, **manually submit scores**.
5. Optional: dispute in 24h. Optional: someone uploads a demo. Logs exist as a **separate** product (`/logs`) with their own `mgeMatchId`, not tied to the league `Match`.

That is a lot of coordination for something the servers, the plugin API, and the site already almost know.

---

## Current systems (what we actually have)

```
┌─────────────┐     API key      ┌──────────────────┐
│ website-next│◄────────────────►│ discord-bot      │
│ leagues,    │                  └──────────────────┘
│ matches,    │     API key      ┌──────────────────┐
│ logs, v1 API│◄────────────────►│ log uploader     │  (not in these repos)
└──────▲──────┘                  └──────────────────┘
       │
       │  (does not exist yet)
       │
┌──────┴──────┐   natives /      ┌──────────────────┐
│ coordinator │   forwards       │ MGEMod (mge.smx) │
│ plugin      │◄────────────────►│ arenas, 2v2 ready│
│ (new)       │                  │ scores, class lock│
└─────────────┘                  └──────────────────┘
       │
       │  official fleet
       ▼
┌──────────────────┐
│ servers-panel /  │  identity: region/host/slot
│ server-infra     │
└──────────────────┘
```

### Website (`website-next`)

| Piece        | Today                                                                                                              | Gap for this RFC                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Match`      | `UNPLAYED` / `PLAYED` / `DISPUTE`. Scores via `submitMatchScores`. `submittedBy` is a **user Steam ID**.           | No `LIVE` / `CLAIMED` status. No plugin actor. No link to `MatchLog`.                                             |
| `Game`       | Per-map scores + `arenaId`. Playoffs can be multi-game / multi-arena (`boSeries`, `boGames`).                      | Arena row has **name/avatar only** — no TF2 map, no MGE gamemode, no frag limit, no class lock, no whitelist.     |
| `Arena`      | League map-pool entry (Spire, Badlands mid, …). Used by map bans.                                                  | Name is not guaranteed to equal the MGE config arena display name. No `map` (`mge_training_v8` vs `mge_bball_…`). |
| `Format`     | `1v1`, `2v2`, `ultiduo`, `bball` rows. Roster/payment knobs.                                                       | No in-game rules (frag limit, rounds, whitelist, class lock, reconnect timer).                                    |
| `Season`     | Week number, deadline, roster lock, signup flags.                                                                  | No per-season match ruleset.                                                                                      |
| External API | `/api/v1/*` + API keys. Existing: users, Discord link, staff roles, **logs upload**, payments, reschedule expiry.  | No “my pending matches” or “claim / report league match” routes.                                                  |
| Logs         | `MatchLog.mgeMatchId` unique. Upload `POST /api/v1/logs/upload` `{ matchid, log, hostname }`. Public `/logs/[id]`. | `mgeMatchId` is the **in-game duel id**, not `Match.id`. No FK to league matches.                                 |
| Score submit | Team owner (and soon team admin). 24h dispute.                                                                     | Plugin report should skip the honour system, still allow dispute.                                                 |

### MGEMod

Single plugin (`mge.smx`). League logic must **not** be compiled into it. The public API is already the extension point:

**Forwards we would use:** `MGE_OnPlayerArenaAdd/Added/Remove/Removed`, `MGE_On1v1MatchStart/End`, `MGE_On2v2MatchStart/End`, `MGE_On2v2ReadyStart`, `MGE_On2v2PlayerReady`, `MGE_OnArenaScoreChange`, `MGE_OnArenaStatusChange`, `MGE_OnArenaPlayerDeath`.

**Natives we would use:** `MGE_AddPlayerToArena`, `MGE_RemovePlayerFromArena`, `MGE_GetArenaInfo`, `MGE_GetArenaCount`, `MGE_GetArenaPlayer`, `MGE_ArenaHasGameMode`, `MGE_SetPlayerReady`, `MGE_GetPlayerArena`.

**Ready confirmation:** 2v2 already has `AS_WAITING_READY` + yes/no menu (`Show2v2ReadyMenu`). 1v1 currently starts when both slots fill (countdown). League 1v1 should get the same ready gate.

**Class change:** per-arena `allow_class_change` in the map cfg. Coordinator can additionally block `MGE_OnPlayerArenaRemove` (`!remove`) while a session is live, but **must allow** the same forward on disconnect (otherwise the slot keeps a ghost client).

**HTTP:** MGEMod has none. The coordinator plugin will need SteamWorks / REST in Pawn (or a small relay). That is expected.

**ELO/Glicko:** official league duels must **not** write pug ratings. Needs an agnostic native/flag (`MGE_SetArenaRated`) — not a league-named convar inside MGEMod.

**Disconnect today** (`OnClientDisconnect` → `HandleClientDisconnection` → `RemoveFromQueue(..., calcstats=true)`): the leaver is cleared from the slot, the arena goes `AS_IDLE` if nobody is waiting in the pug queue, and the remaining player **stays** in their slot. The next time both fighting slots are filled, `Timer_StartDuel` calls `ResetArenaScores` → **0–0**. Early-leave forfeit (`ProcessMatchForfeit` / `On1v1MatchEnd` / ratings) only runs if the arena cfg set `early_leave_threshold` > 0 (default is 0). See **MGEMod API: what we already have vs what we still need** for what the coordinator can and cannot do with the current forwards.

### Logs

The log uploader is not in these git repos. It already POSTs to the website with a unique `mgeMatchId`. Public pugs still abort on disconnect (`player_disconnect` / `map_change` / `plugin_unload`). Official fights **pause** the same session (D34) — see Logs.

Linking a log to a league match is a **website** problem (stamp `leagueMatchId` at source, plus `mgeMatchId` on report).

### Official servers

Fleet identity is `region/host/slot`. The coordinator plugin should only load (or only **claim**) on official boxes. A player on a community MGE server running the same map must not be able to start an official match.

---

## Happy path (v1 story)

Player A registered, paid, week 1 exists. They have one or more `UNPLAYED` matches (maybe 1v1 **and** 2v2 **and** bball).

1. A joins an official server in their region. Map is `mge_training_v8`.
2. A runs `!league` / `!match` / `sm_league` (name TBD).
3. Plugin `GET`s pending matches for A’s Steam ID.
4. Menu:

- `S15 NA 1v1 W1 vs PlayerB — Spire — first to 20`
- `S15 NA 2v2 W1 vs TeamX — Granary last — first to 20` (teammate: C)
- `S15 NA BBall W1 vs TeamY — needs mge_bball_* — you are on the wrong map`

5. A picks the 1v1. Confirm: “Start this match now?”
6. Plugin `POST`s **claim** to the website. Match becomes `CLAIMED`. Arena “Spire” is resolved on the current map. If missing → error, do not claim (or roll back the claim).
7. Plugin adds A to Spire. From that moment the arena is **managed** (D31 / D22): no public auto-start, no pug queue, no random `!add`. Kick anyone already waiting in that arena’s queue (that is not an active fight — D33). Block `!remove` unless the client is disconnecting.
8. Opponent / teammate join (menu only, never a silent pull):

- If B is **already on this server** when A claims: B immediately gets “Your league match vs A is waiting in Spire. Join?”
- If B is **not** here: A waits. HUD: “Waiting for opponent. Claim expires in N minutes.”
- The moment B **connects** to this server, the same join menu is shown. They do not need to type `!league`.
- Yes → plugin adds them to the reserved slot.
- No → they stay in their pug. **Do not re-prompt** until they type `!league` (D23). Chat to A: “B chose not to play right now.”

9. When both (1v1) or all four (2v2) are in the reserved arena → MGEMod does **not** auto-countdown (D24 / D31). Coordinator ready menu. Both/all must Yes.
10. On last Yes: coordinator starts the countdown, then **LIVE**. Timestamp stored. Log session opens (same session will pause/resume on disconnect — D34).
11. Play to the configured frag limit. Class / remove / add rules from the match payload.
12. When the coordinator’s own fight hits the frag limit → plugin `POST`s the result. It does not report pug endings on other arenas (D35). Body: `{ scores, pluginName, pluginVersion, server, map, arena, logMatchId? }`.
13. Website marks `PLAYED`, `submittedBy` = system/plugin actor, UI shows **Reported by mge_league 1.2.3**. Log URL attached if known.
14. 24h dispute still exists. Staff can override.

---

## Recommended architecture

**Three layers. The live fight is not owned by the website.**

### 1. Website is the fixture book and the ledger — not the referee

- **Fixture book:** who is in the match, arena(s), series, frag limit, class rules, region. That exists before anyone types a command.
- **Bulletin board:** the plugin **tells** the website “this fixture is on NA #3 now” (`claim`) so the rest of the fleet does not start the same row. Atomic so two servers cannot both succeed. That is a lock on the **fixture row**, not the website running the fight.
- **Ledger:** the plugin **tells** the website the result, a forfeit, an abort, or a log id. The website writes `PLAYED` / `UNPLAYED` / `DISPUTE`. Players never POST scores from the game client.
- **Live page (optional):** the plugin may push presence and score so `/matches/[id]` can show “playing now”. If that stream stops, the page looks stale. The website does **not** declare the fight dead, does **not** forfeit, does **not** revert `LIVE` by itself (drop the old heartbeat-kill idea).

Auth on those routes is still plugin API keys, not player cookies.

### 2. Coordinator is a **separate repo and a separate `.smx`**

Locked. Working name `mge_league.smx`. Own git repo from day one.

- Owns the live session: menus, timers, who may enter, snapshot, ready, when to tell the website a result.
- Talks HTTP to the website (claim / report / abort / optional live push).
- Talks natives/forwards to MGEMod (`#include <mge>`).
- Tells `mge_logs` (via MGEMod pause/resume, not league-specific hooks) to keep **one** recording.

It is **not** a compile unit of `mge.sp`. If `mge_league.smx` is not loaded, nothing league-shaped exists.

### 3. MGEMod grows only **agnostic primitives**

If the coordinator needs a capability, we add it to `mge.inc` as something **any** plugin could use (a gather, a cup). We do **not** add `MGE_IsLeagueMatch`, website URLs, or “forfeit after 180s” inside `mge.smx`.

The orderly shape is **one managed-arena switch** (D31), not a pile of one-off Stop hooks named after league. Public MGE stays default. A managing plugin opts in per arena.

### Why not “website polls game servers”?

RCON + `status` cannot run ready menus, cannot snapshot a rocket jump, cannot know the fight. The game server drives the session. The website records what it is told.

---

## MGEMod API: what already exists vs what we add

League logic stays in `mge_league`. MGEMod only grows verbs that a **non-league** plugin might also want. Names must not say “league”.

### What already exists (do not confuse with the new stuff)

| Thing                                                | What it is                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MGE_OnPlayerArenaAdd` / `MGE_OnPlayerArenaRemove`   | **Already there.** Blockable. `!add` / `!remove` go through them.                                                                                    |
| `MGE_On1v1MatchStart` / `On2v2MatchStart`            | **Already there.** `void`. Fires when the countdown hits 0 and the fight begins. Too late to stop the pug auto-start. Cannot skip `Timer_StartDuel`. |
| `MGE_On1v1MatchEnd` / `On2v2MatchEnd`                | **Already there.** `void`. Fires when MGEMod thinks a duel ended (last frag **or** early-leave forfeit).                                             |
| `MGE_GetArenaScore`                                  | **Already there.** No setter yet.                                                                                                                    |
| `MGE_AddPlayerToArena` / `MGE_RemovePlayerFromArena` | **Already there.**                                                                                                                                   |

There is **no** `MGE_OnArenaDuelStart` in `mge.inc` today. That name was a sketch for a new forward. We are **not** shipping a pile of league-named hooks. We add **managed arena** instead (D31).

### Why add/remove Stop is not enough by itself

Public MGE on disconnect (`RemoveFromQueue`):

1. Vacates the leaver. The other player **stays**. They are literally alone in the arena. That is fine (D32).
2. Training cfgs set `early_leave_threshold` to **3** → MGEMod **forfeits the pug**, writes Glicko, fires `On1v1MatchEnd`. Managed mode must skip that (D26).
3. If someone is waiting in the pug queue, MGEMod copies them into the empty slot **without** `OnPlayerArenaAdd`, then starts a new 0–0 duel. Managed mode must skip rotate **and** refuse `!add` into that arena’s queue so the queue stays empty (D31, D33).
4. When the leaver is added back, `Timer_StartDuel` always zeros the score and countdown. Managed mode must skip that (D24). First fill uses the **same** timer — that is why 1v1 league cannot start “when the second player walks in”.

`MGE_On1v1MatchStart` cannot fix this. It runs after the damage is done.

### The orderly primitive: managed arena (D31)

Working names — final signatures in `mge.inc`, append-only.

```
native void MGE_SetArenaManaged(int arena, bool managed);
native bool MGE_IsArenaManaged(int arena);
```

When `managed` is true, MGEMod keeps the arena, spawns, damage, HUD score — and **skips the public policy**:

- no `Timer_StartDuel` on slot fill
- no early-leave forfeit / Glicko / match-end from a disconnect
- no queue rotate on leave
- no queue rotate on last frag (loser is not replaced by a waiter)
- player `!add` into that arena is refused (they cannot even sit in the queue)
- `!remove` still blocked except disconnect (ghost client if we Stop remove on DC)

Public arenas with `managed = false` behave exactly as today.

Pause / resume for **logs and overlays** (agnostic, not “league”):

```
forward void MGE_OnDuelPaused(int arena_index);
forward void MGE_OnDuelResumed(int arena_index);
```

The managing plugin calls into MGEMod (or MGEMod fires these when the director says pause). `mge_logs` hooks them. A cup plugin gets the same thing.

### Other natives the director still needs

| Native / forward                                            | Why it is agnostic                                                            | What the coordinator does with it                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MGE_SetArenaManaged`                                       | Cups / gathers / league. One switch instead of eight Stop hooks.              | Set true on claim once the starter is in the arena. False after report (or abort).                               |
| `MGE_OnDuelPaused` / `OnDuelResumed`                        | Logs and overlays.                                                            | Pause on LIVE disconnect; resume after both ready.                                                               |
| Countdown **without** `ResetPlayer` / without zeroing score | Resume must restore the snapshot. Today’s `StartCountDown` respawns everyone. | First ready may still reset (fresh fight). Post-disconnect ready: countdown, then coordinator restores snapshot. |
| `MGE_SetArenaScore(arena, red, blu)`                        | Overlays, paused fights.                                                      | Write 14–11 back if MGEMod cleared it.                                                                           |
| `MGE_SetArenaFragLimit(arena, n)`                           | Custom first-to-N.                                                            | Payload 20 vs cfg 10.                                                                                            |
| `MGE_SetArenaRated(arena, bool)`                            | Any unrated event.                                                            | League: `false` so a normal last-frag completion does not write Glicko.                                          |

Snapshot of health / origin / angles / velocity is **coordinator-side** (SourceMod already has those). MGEMod must not wipe them on resume countdown.

### What must **not** land in MGEMod

- HTTP to mge.tf.
- 180-second forfeit timers (coordinator owns those).
- Roster / Steam ID allowlists for a league fixture.
- “This is a league match” convars.
- Website match ids.
- Natives named `LockArena` / `Hold` / `League*`.

A gather with a 60s reconnect uses the same managed switch and its own timer.

---

## Match session state machine

Website `Match.status` today is too small. Proposal (names TBD):

```
UNPLAYED
   │ claim
   ▼
CLAIMED ──── expire / abort ──► UNPLAYED
   │ all required players in arena + all ready
   ▼
LIVE
   │ normal end
   ▼
PLAYED
   │ dispute (unchanged, 24h)
   ▼
DISPUTE

LIVE ── disconnect timeout (one side gone) ──► PLAYED (forfeit)
LIVE ── both gone past timeout (D30)       ──► UNPLAYED
LIVE ── staff cancel                       ──► UNPLAYED
```

`CLAIMED` vs `LIVE` matters: claimed means the plugin told the website “we opened this on server X”; live means ready passed, this counts. A disconnect **before** ready should not forfeit. A disconnect **after** LIVE stays `LIVE` on the ledger until the **plugin** reports forfeit, abort, or a result. The website does not flip this by itself.

Per-game series (Bo3 arenas): one claim for the whole match; plugin walks games in order; website stays `LIVE` until the plugin says the series is over.

Live display fields on `Match` (server, plugin version, last push) are whatever the plugin last sent. Stale display is OK. They are cleared when the plugin aborts or reports.

---

## Data the plugin must receive (match payload)

Minimum for “start this now”:

```json
{
  "matchId": 18421,
  "format": "1v1",
  "gamemode": "mge",
  "region": "na",
  "weekLabel": "Week 1",
  "season": { "id": 44, "num": 15 },
  "status": "UNPLAYED",
  "rules": {
    "fragLimit": 20,
    "series": { "type": "bo1", "games": 1 },
    "allowRemove": false,
    "allowClassChange": false,
    "allowedClasses": ["soldier"],
    "whitelistId": null,
    "reconnectSeconds": 180,
    "claimExpiresSeconds": 900,
    "readyTimeoutSeconds": 60
  },
  "games": [
    {
      "gameNum": 1,
      "arena": {
        "id": 12,
        "name": "Spire",
        "tf2Map": "mge_training_v8",
        "gamemode": "mge"
      }
    }
  ],
  "home": {
    "teamId": 901,
    "label": "PlayerA",
    "players": [{ "steamId64": "7656…", "name": "A", "classLock": "soldier" }]
  },
  "away": {
    "teamId": 902,
    "label": "PlayerB",
    "players": [{ "steamId64": "7656…", "name": "B", "classLock": "soldier" }]
  }
}
```

`tf2Map` + `gamemode` are **new** on `Arena` (or a join table). Without them the plugin cannot say “wrong map, join BBall EU #2”.

`whitelistId` is a placeholder: we do not have item-schema whitelists in the DB today. Class lock we can do with MGE `allowed_classes` + coordinator checks. Item whitelist needs TFTrue / `tf_weapon` hooks or a known SM plugin — **out of v1 unless we already run one on official servers.**

---

## Website API sketch (plugin-facing)

All under `/api/v1/league/…`, API key, rate limited. Plugin identifies the server (`region`, `hostname`, `slot` or a pre-shared server id from the fleet).

| Method | Route                                      | Purpose                                                                                                                  |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/league/players/:steamId/pending-matches` | Menu. Only `UNPLAYED` (and maybe `CLAIMED` if they are already in that session). Filter by format optional.              |
| `POST` | `/league/matches/:id/claim`                | Atomically `UNPLAYED` → `CLAIMED`. Body: server id, plugin version, chosen game/arena. 409 if already claimed elsewhere. |
| `POST` | `/league/matches/:id/live`                 | **Optional display only.** Presence, scores, state. Does not keep the fixture alive. Does not expire it if it stops.     |
| `POST` | `/league/matches/:id/ready`                | Ready-check passed; `CLAIMED` → `LIVE`.                                                                                  |
| `POST` | `/league/matches/:id/report`               | Official result. Idempotent. Includes plugin version, per-game scores, forfeit flag, `mgeMatchId` / log id if known.     |
| `POST` | `/league/matches/:id/abort`                | Back to `UNPLAYED` if still `CLAIMED` (nobody ready). Staff or both-sides-agree later.                                   |
| `POST` | `/league/matches/:id/forfeit`              | Disconnect timeout / explicit FF.                                                                                        |
| `POST` | `/league/matches/:id/attach-log`           | Bind `MatchLog` after upload if the log arrived late.                                                                    |

**Claim must be atomic** (same `FOR UPDATE` pattern as `submitMatchScores`). Two servers claiming the same match is the classic race.

**Report must refuse** if status is not `LIVE` (or `CLAIMED` + forfeit-before-start? no — that is abort). Double report → 409, first write wins.

Human score submit (`submitMatchScores`) must refuse if status is `CLAIMED` or `LIVE` (“this match is being played on NA #3”). After `PLAYED` by plugin, humans cannot overwrite; they dispute.

### Attribution

Do not reuse `submittedBy` as a fake Steam ID if we can avoid it.

Options:

1. Keep `submittedBy` nullable and add `reportedByPlugin` / `pluginVersion` / `pluginServerId` columns on `Match`.
2. Sentinel user `STEAM_PLUGIN` — ugly.
3. JSON `reportMeta` on `Match`.

**Recommend (1).** Match page: badge “Official plugin report · mge_league 0.4.0 · na/host-a/3”. Audit log the report.

---

## In-game UX

### Command and menu

- Chat: `!league` / `!match` (avoid colliding with existing `!add`, `!rank`, `!top`).
- If the player has **zero** pending matches: “No pending league matches.”
- If they have one: skip the list, go to confirm (still show opponent + arena + rules).
- If they have many: list. Grey out entries that cannot start on **this map** (bball while on training), with a hint of which official server/map.

### Wrong map

Do not `changelevel`. Ops policy already forbids casual changelevel on the fleet. Tell the player where to go. Later: website/Discord “join this server” link. **v1 = message only.**

### Who gets pulled into the arena

Locked: **menu only**, never a silent teleport (someone 19–18 in a pug must be able to refuse).

1. Starter confirms → plugin claims → starter is moved into the locked arena.
2. Every **other required Steam ID** already on this server gets the join menu immediately.
3. `OnClientPutInServer` (or equivalent): if this Steam ID belongs to a claim waiting on **this** server, show the same join menu as soon as they spawn. No command required.
4. Yes → `MGE_AddPlayerToArena` into the reserved home/away slot. No → they stay where they are. **No second prompt** until they run `!league`. Chat to whoever is waiting in the arena: the rival chose not to play right now (D23).
5. Non-roster Steam IDs never get the menu. `MGE_OnPlayerArenaAdd` → Stop if that arena is in match mode and the Steam ID is not on the roster (D22).

If the opponent is not on any official server: waiting state + website live indicator. Discord ping is a later phase.

### Slot assignment

Website payload says who is home/away. Plugin maps home → RED slots, away → BLU slots (1v1: slot 1 vs 2; 2v2: 1+3 vs 2+4, matching MGEMod).

**Who may start:** any **active** roster member of either team.

**Who may enter the arena:** only those same active roster Steam IDs, up to the format’s player count. Extra roster (e.g. 2v2 with 3 paid) can fill a slot **before** LIVE. No mid-LIVE substitute in v1.

### Ready check

Reuse 2v2’s yes/no menu for all formats. League 1v1 does not start when the second player enters: managed arena skips `Timer_StartDuel`; coordinator shows ready; then coordinator starts the countdown.

Two ready clocks:

- **First ready** (`CLAIMED`): timeout → stay waiting. Do not forfeit (claim TTL still applies).
- **After a LIVE disconnect** (D21 / D25): one **No** → warn “this is a forfeit win for the other”, then forfeit. Both No, or nobody Yes before timeout → abort `UNPLAYED`.

### During match mode (CLAIMED with starter in arena, through LIVE, through disconnect wait)

- `MGE_SetArenaManaged(true)` (D31). Arena stays blocked: only the people already in this official fight may re-enter.
- Block `!remove` unless they are disconnecting (otherwise a ghost slot). Chat: official match, 3 min reconnect.
- Player `!add` into this arena (including queue) is refused. Do not sit randoms in the queue “for later”.
- Unrated + frag limit from the payload.
- Spectators: **allow** anyone in v1; they cannot take a slot.
- Class: payload wins over cfg.
- HUD: “LEAGUE · Week 1 · 14–11 · first to 20”.

### Disconnect while LIVE (the 180s window)

1. **Snapshot first** (D32): score, and for every participant still in the arena — health, origin, eye angles, velocity. Then the leaver’s slot vacates. The other player stays. They can keep shooting at empty space. That is OK.
2. Managed arena stays managed. Nobody else `!add`s. Fire `MGE_OnDuelPaused` so `mge_logs` **pauses** the same session (D34), it does not abort.
3. Coordinator starts **that player’s** 180s clock. HUD countdown. If the other player also drops, they get **their own** 180s clock. The arena may be empty; the plugin still holds snapshot + clocks.
4. Reconnect to **this** server: auto-slot (they already accepted). Cancel **their** 180s (D27). Ready both (D21). Both Yes → countdown that does **not** `ResetPlayer`, restore snapshot, `MGE_OnDuelResumed`, fight continues. One No / both No: D25.
5. Reconnect to a **different** official server: “your match is live on NA #1”. Do not claim twice.
6. One clock expires, the other side is still around: coordinator reports **forfeit**. Then `managed = false`. Ledger: `PLAYED` with `forfeit: true`.
7. **Both** clocks expire, nobody back (D30): coordinator reports **abort**. Ledger: `UNPLAYED`. No forfeit. Typical case: shared ISP drop.

Reconnect-to-same-slot is not a silent first pull. They already said Yes to start.

**2v2:** same director. Cancel MGEMod’s 2v2 ready timers. Snapshot all four (or whoever was alive). One player DC does not dump the three others into a public pug. Each missing player has their own 180s. Details in Phase 4; the primitive is the same managed arena.

### After the last frag

Public MGE rotates the loser and pulls the queue. **Managed arena does not.** Freeze, scoreboard, POST report, upload **the one** log, then `managed = false` and the arena is public again.

Starting a league match must **never** steal a public fight in progress (D33). If Spire is mid-pug, bounce: no free arena.

---

## Logs

Two ids exist and must stay distinct:

| Id                    | What                      |
| --------------------- | ------------------------- |
| `Match.id`            | League fixture (website). |
| `MatchLog.mgeMatchId` | In-game duel recording.   |

### Requirement: pause and resume, **one** file (D34)

Today `mge_logs` treats disconnect as abort: it writes `mge_match_aborted`, flushes `*_incomplete.log`, and is done. A later `On1v1MatchStart` is a **new** session. That is correct for public MGE. It is **wrong** for an official fight we are holding for 180s.

Pipeline change (all three repos):

1. **`mge_logs`** — On `MGE_OnDuelPaused`: keep the session open, append `mge_match_paused`, do **not** abort, do **not** upload. Stop routing combat lines until resume (nobody is fighting). On `MGE_OnDuelResumed`: append `mge_match_resumed`, same `matchid`, keep buffering. On real `On1v1MatchEnd` from the **managed** fight: one `mge_match_end`, one file, one upload. Pause/resume forwards are the signal — not a second `CreateSession` on `On1v1MatchStart`. If MatchStart fires while that arena already has a paused session, **resume**, do not open a new file.
2. **`mge-logs-parser`** — Accept pause/resume markers. One `ParsedMatch`. Combat time excludes the pause gap. `aborted=false` if the file ends with `mge_match_end`.
3. **website** — One `MatchLog` row on that fixture. Do not attach an `_incomplete` abort from the pause.

Public pugs are unchanged: disconnect still aborts.

Stamp `leagueMatchId` on the session when the coordinator starts (link strategy A). Report still carries `mgeMatchId` (B).

Schema: `MatchLog.leagueMatchId` optional FK → `Match`.

---

## Edge cases

This is the part that will grow every iteration. Locked product calls are cited (Dxx). Rows without a lock are still open.

### Presence and disconnects

| #   | Case                                                                   | Recommendation                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Opponent never joins after claim                                       | Claim expires (`claimExpiresSeconds`, e.g. 15 min). Match returns `UNPLAYED`. Starter is unlocked. No forfeit.                                                                                                                                                              |
| E2  | Disconnect **before** ready                                            | Treat as leave-wait. Do not forfeit. After timeout, abort claim if the arena is empty of one side.                                                                                                                                                                          |
| E3  | Disconnect **after** LIVE                                              | Snapshot first (D32). Vacate leaver. Managed skips early-leave (D26). Stayer stays, may shoot at nothing. Pause the **same** log (D34). That player’s 180s. Reconnect this server → auto-slot, cancel their 180s (D27), **both ready** (D21), restore snapshot, resume log. |
| E4  | Reconnect to a **different** official server                           | Website knows the claim is on server X. Other servers’ `!league` / connect prompt: “your match is live on NA #1”. No second claim.                                                                                                                                          |
| E5  | One player’s reconnect window expires (the other side is still around) | Coordinator reports forfeit, then `managed = false`. Remaining side wins the **match** (`forfeit: true`). Snapshot score is evidence, not the series score.                                                                                                                 |
| E6  | Both disconnect                                                        | Arena may be empty; plugin keeps snapshot + two clocks. One returns inside 180s: they wait, the other’s clock keeps running. **Neither** returns (D30): abort `UNPLAYED`, no forfeit.                                                                                       |
| E7  | Map change / server restart mid-LIVE                                   | Plugin gone → cannot report. Staff abort on the website. Do **not** auto-FF from a missing live push. Plugin crash while MGEMod keeps going: **out of scope v1** (E72).                                                                                                     |
| E8  | Player `retry` / reconnect same server inside window                   | Steam ID is the key. Auto-fill the reserved slot; cancel their 180s (D27); **ready both** (D21); restore snapshot. Not the first-join menu.                                                                                                                                 |
| E9  | Player in spectator after death, then disconnect                       | Same as E3. Score unchanged.                                                                                                                                                                                                                                                |

### Roster, format, substitutes

| #   | Case                                                 | Recommendation                                                                                                                                                                 |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E10 | 2v2, only one teammate online                        | Cannot ready. Wait for second, or allow **another active roster member** to take the empty slot **before** LIVE. Cannot start 1v1 in a 2v2 fixture.                            |
| E11 | Extra roster member wants in, slots full             | Reject. Menu: “slots filled by A and C”.                                                                                                                                       |
| E12 | Wrong teammate (player from another team)            | Never add. Steam ID must be on home or away active roster.                                                                                                                     |
| E13 | Player on **both** teams (should be impossible)      | API must not return that match as startable; log error.                                                                                                                        |
| E14 | Player has pending 1v1 **and** 2v2                   | Menu lists both. One `LIVE` at a time **per player**. Claiming match 2 while already `LIVE` on match 1 → deny.                                                                 |
| E15 | Same team has two matches the same week (should not) | Menu still lists; claims independent.                                                                                                                                          |
| E16 | Inactive / dropped roster member                     | API excludes them from `players[]`. They cannot claim.                                                                                                                         |
| E17 | Unpaid / unready team, match already generated       | Policy: if `Match` exists as `UNPLAYED`, allow play (staff already generated). Or hide until both teams `READY`. **Recommend allow if match exists** — generation is the gate. |
| E18 | Sub joins mid-LIVE (original DC)                     | Dangerous. v1: **no mid-match sub**. Reconnect original or FF. Later: captain confirms sub, score continues.                                                                   |

### Arena, map, server

| #   | Case                                         | Recommendation                                                                                                                                                                          |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E19 | Arena name not on this map                   | Do not claim. Tell them the `tf2Map`.                                                                                                                                                   |
| E20 | Arena exists but occupied by a pug           | **Never** steal an active fight (D33). Bounce: no free arena. Idle arena with queue waiters only is not a fight — kick those waiters, tell them it is reserved. Wrong map: same bounce. |
| E21 | Two league matches want the same arena       | Second claim waits or picks another server. Website should prefer servers where that arena is free (v2).                                                                                |
| E22 | Player starts claim on EU, match is NA       | API filters pending matches by **match region**. Do not show NA fixtures on EU boxes (or show them greyed: “wrong region”).                                                             |
| E23 | Community server with leaked plugin          | Plugin must auth with a **server-scoped API key**. Website allowlists official server ids. Unknown host → 403.                                                                          |
| E24 | Workshop map vs `mge_training_v8` alias      | Use MGEMod’s workshop-normalized map name. Store aliases on `Arena.tf2Map`.                                                                                                             |
| E25 | Bo3, game 2 is another arena on **same** map | After game 1 report-partial, move players, new ready check, continue. Match stays `LIVE`.                                                                                               |
| E26 | Bo3, game 2 is **another BSP**               | v1: unsupported (message: play remaining games after joining map Y). Do not changelevel.                                                                                                |
| E27 | Map bans incomplete                          | Match is not startable. Menu: “Finish map bans on the website.”                                                                                                                         |
| E28 | No arena assigned yet (staff forgot)         | Not startable. Same message.                                                                                                                                                            |

### Rules and cheating the pug systems

| #   | Case                                         | Recommendation                                                                                                                                            |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E29 | `!remove` mid-LIVE                           | Blocked. Chat: “Official match — you cannot leave. Disconnect rules: 3 min.”                                                                              |
| E30 | `!add` a third player                        | `MGE_OnPlayerArenaAdd` → Stop. Message: this arena is in a match.                                                                                         |
| E31 | Class change when league forbids it          | Blocked; force allowed class.                                                                                                                             |
| E32 | Class change when league allows it           | Allowed between rounds / on death, matching MGE arena cfg **and** payload. Payload wins.                                                                  |
| E33 | Pug queue already waiting when we claim      | Kick waiters on this arena (not an active fight — D33). Managed also refuses later `!add` into the queue. Internal pug rotate must not run while managed. |
| E34 | League match should not move Glicko/ELO      | `MGE_SetArenaRated(arena, false)` for the session. Blocker for v1 until that native exists.                                                               |
| E35 | First-to-20 but arena cfg is first-to-10     | `MGE_SetArenaFragLimit`. Payload wins.                                                                                                                    |
| E36 | Whitelist / banned weapons                   | v1 skip unless we already have a whitelist plugin. Document as Format/Season field for later.                                                             |
| E37 | HP / ammo / gamemode mismatch (endif vs mge) | Payload `gamemode` must match `MGE_ArenaHasGameMode`. Else refuse.                                                                                        |
| E38 | Player suicides to stall                     | Counts as a frag for opponent (already MGE). No extra rule.                                                                                               |
| E39 | Friendly fire / teamkill in 2v2              | Existing MGE behaviour.                                                                                                                                   |
| E40 | Pausing for a phone call                     | No pause button in v1. Disconnect uses the 180s window. Walking away without DC is on them.                                                               |

### Reporting, disputes, staff

| #   | Case                                                               | Recommendation                                                                                                                                                                       |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E41 | Plugin reports, then loser disputes                                | Allowed, 24h, same as today. Badge still says plugin report; staff see plugin log + MGE log.                                                                                         |
| E42 | Plugin report fails (HTTP 500) after match ended                   | Retry with backoff. Keep scores locally. HUD: “Result pending upload.” Keep `managed` until ack. Optional live push is unrelated — missing display ticks must not unlock or forfeit. |
| E43 | Website has `PLAYED` from a **human** while plugin tries to report | 409. Plugin shows “already reported on the site.”                                                                                                                                    |
| E44 | Human tries to submit while `LIVE`                                 | Form error: “In progress on NA #1.”                                                                                                                                                  |
| E45 | Scores disagree with the log                                       | Log is evidence, plugin score is official. Staff resolve disputes.                                                                                                                   |
| E46 | Match ended 20–20 / error                                          | Should be impossible (first to N). If draw, do not mark `PLAYED`; abort + staff.                                                                                                     |
| E47 | Forfeit reported, opponent says they were lagging                  | Dispute. Staff.                                                                                                                                                                      |
| E48 | Staff force-report / undo                                          | Existing admin match tools. Must also **release** a claim (new admin action: abort live session).                                                                                    |
| E49 | Week deadline passes while `LIVE`                                  | Let it finish. New claims after deadline: deny (season `matchDeadline`).                                                                                                             |
| E50 | Playoff match, loser must go to lower bracket                      | Report uses the same `submitMatchScores` winner path so playoff advancement stays in website code. Plugin does not know about brackets.                                              |

### Logs specifically

| #   | Case                                     | Recommendation                                                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| E51 | Log upload before league report          | Matcher or `leagueMatchId` on upload. Attach when match `LIVE`/`PLAYED` and steam ids match.                                    |
| E52 | Log upload after report                  | `attach-log` from plugin or a delayed job on `mgeMatchId`.                                                                      |
| E53 | Two logs for one league match            | Must not happen on pause/resume (D34). If a pug abort file still appears, ignore it; attach the one `mgeMatchId` on the report. |
| E54 | Disconnect mid-official then they finish | Pause the **same** session (`mge_match_paused` / `mge_match_resumed`). One file, one upload. Do **not** abort to `_incomplete`. |
| E55 | Parser `ParseError`                      | League result still stands. Log link missing.                                                                                   |

### UX / social

| #   | Case                                                               | Recommendation                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E56 | Starter claims and AFK in arena                                    | Claim expiry (E1). Don’t hold the arena all evening.                                                                                                                                                         |
| E57 | Opponent is in a pug 19–18 and ignores the join menu / taps No     | Their problem. Starter waits until claim expiry. No force-pull. After No: no re-prompt; tell the waiter (D23).                                                                                               |
| E58 | Both want to start on different servers at once                    | First successful `claim` wins. Other 409: “Already claimed on EU #2.”                                                                                                                                        |
| E59 | Trash talk / all-chat                                              | Out of scope (SourceBans).                                                                                                                                                                                   |
| E60 | Stream delay / spec cheats                                         | Out of scope for v1. Maybe lock spec to staff later.                                                                                                                                                         |
| E61 | Ready-check yes, then immediately `!remove`                        | Remove already blocked; if they DC, E3.                                                                                                                                                                      |
| E62 | Ready-check: 3/4 yes, one no                                       | Stay in `CLAIMED`. No start. The No player can be replaced only if not LIVE (E18).                                                                                                                           |
| E63 | Language / menu spam                                               | One menu at a time; command cooldown.                                                                                                                                                                        |
| E64 | Player not logged into website Steam but is the same Steam account | Steam ID is enough. No website session in-game.                                                                                                                                                              |
| E65 | Alt account                                                        | Out of scope (altcheck / staff). Plugin trusts roster Steam IDs.                                                                                                                                             |
| E66 | Opponent connects while a claim is waiting on that server          | Show the join menu immediately on spawn. Do not wait for `!league`.                                                                                                                                          |
| E67 | LIVE DC on training (`early_leave_threshold` 3)                    | Managed skips pug forfeit (D26). Coordinator must **not** POST a leaked `On1v1MatchEnd` as the league result (D35).                                                                                          |
| E68 | Second player fills the arena the first time (CLAIMED)             | Same `Timer_StartDuel` as post-DC. Managed skips it (D24 / D31). Coordinator ready, then coordinator starts.                                                                                                 |
| E69 | Post-DC ready: one No, or ready timeout                            | Locked D25. Warn then forfeit that side. Both No / nobody Yes → abort `UNPLAYED`. Not a join-menu No (D23).                                                                                                  |
| E70 | Starter wants out while still `CLAIMED`                            | Locked D28. Roster abort → `UNPLAYED`. Cannot abort `LIVE`.                                                                                                                                                  |
| E71 | Stayer DCs during the 180s wait; original leaver returns first     | Each has their own reconnect clock. First back waits. Both must rejoin then both ready (D21). If one clock expires and the other side is around → that side’s forfeit. If both clocks expire → D30.          |
| E72 | `mge_league` unload / crash while MGEMod keeps going               | **Out of scope v1.** Improbable. Do not design a recovery path yet.                                                                                                                                          |
| E73 | Stayer left alone during 180s                                      | They stay in the slot. Shooting at nothing is OK. HUD: waiting for reconnect. Arena stays managed — no pug joins. Restore snapshot when both ready, including if they were in the air.                       |
| E74 | Coordinator sees a pug `On1v1MatchEnd`                             | Ignore. Only report sessions **it started** (D35).                                                                                                                                                           |
| E75 | After last frag, pug queue rotate                                  | Managed: no queue, no rotate. Freeze, report, one log, then `managed = false`.                                                                                                                               |
| E76 | 2v2 auto-start / ready timers                                      | 2v2 uses `Start2v2ReadySystem`, not `Timer_StartDuel`. Managed (or the director) must cancel that path too. Snapshot + per-player 180s + restore: same director. Phase 4; open D36 for team-forfeit details. |

---

## Schema / product gaps to invent

None of these should be sneak-implemented without a decision.

1. **`Match` statuses** `CLAIMED` and `LIVE` on the existing enum. When a claim expires or is aborted, status returns to `UNPLAYED` and the live fields below are cleared. **No session-history table** — we do not care that someone claimed and AFK’d last Tuesday.
2. **Live fields on `Match`** (current attempt only): `claimedServerId`, `claimedAt`, `claimedBySteamId`, `pluginName`, `pluginVersion`, `lastLivePushAt`. Null when `UNPLAYED`/`PLAYED`/`DISPUTE`. Display only — missing pushes do not change status.
3. `Arena.tf2Map`, `gamemode`, optional `mgeArenaName` if display names diverge.
4. **Ruleset** on `Format` and/or `Season` (frag limit, class lock, reconnect 180, claim TTL). Match can override (playoffs).
5. **Plugin report columns** (or reuse the live fields + `forfeit` flag).
6. `MatchLog.leagueMatchId`.
7. **MGEMod agnostic API:** `MGE_SetArenaManaged` (D31), `MGE_OnDuelPaused` / `OnDuelResumed` (D34), countdown **without** `ResetPlayer`, `MGE_SetArenaScore`, frag limit, unrated. Snapshot of health/origin/angles/velocity is coordinator-side. **Not** Lock/Hold/League natives. Prerequisite for Phase 3.
8. **Server allowlist** for plugin API keys (fleet inventory).
9. **Live indicator** on `/matches/[id]` (“Playing now on NA MGE #1”). Optional plugin push; poll v1. Stale is OK.

### Why `MatchSession` was on the table (and why it is not)

A separate table would have stored every claim attempt: A claimed 20:00, expired; B claimed 21:10, played. Useful for staff forensics (“who kept claiming and bailing?”). We do not want that history. One fixture, one current attempt, overwrite or clear.

---

## Suggested phases (after the RFC settles)

Independently shippable. Do not start Phase 3 before Phase 1 API is real.

| Phase  | What                                                                                                                                                                    | Notes                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **0a** | MGEMod: `MGE_SetArenaManaged`, pause/resume forwards, countdown without `ResetPlayer`, set score / frag limit / unrated. 2v2 auto-ready path must honour managed (E76). | Ships in MGEMod. No league code. No Lock/Hold natives.                                                                                     |
| **0b** | Rules + arena metadata on the website                                                                                                                                   | `tf2Map`, gamemode, frag limit, class rules per format/season. Map-ban complete ⇒ startable.                                               |
| **1**  | Plugin API: pending + claim + optional live display + abort + report                                                                                                    | Atomic claim. Admin force-abort. Statuses `CLAIMED`/`LIVE` on `Match`. No website-kills-the-match.                                         |
| **2**  | `mge_league` v1 (own repo): **one** format, **one** region, **one** map                                                                                                 | 1v1, training map, Bo1, join menu (including on connect), ready check, managed arena, report + attribution. Bounce if no free arena (D33). |
| **3**  | Disconnect 180s + snapshot restore + both-ready-again + forfeit / both-gone abort                                                                                       | Uses managed + pause log + restore snapshot. Auto-slot on same-server reconnect. Per-player clocks (D30).                                  |
| **4**  | 2v2 (and then ultiduo)                                                                                                                                                  | Director owns ready timers, snapshot, reconnect. Cancel MGEMod 2v2 ready system. Open D36.                                                 |
| **5**  | Log pipeline: pause/resume + stamp `leagueMatchId`                                                                                                                      | `mge-logs` + parser + website attach. One file per official fight (D34).                                                                   |
| **6**  | Live match page + optional Discord “claimed on server X”                                                                                                                | Display only. Depends on realtime-notifications / bot.                                                                                     |
| **7**  | BBall / other BSPs, multi-arena series                                                                                                                                  | Wrong-map messaging first; series walker second.                                                                                           |
| **8**  | Dedicated league arenas or league-only servers                                                                                                                          | Only if D33 bounce is painful in prod.                                                                                                     |
| **9**  | Cups / events orchestration                                                                                                                                             | Same engine; bracket-rendering live status.                                                                                                |

Phase 2 is the first thing a player can touch. Everything before that is plumbing.

---

## Non-goals (v1)

- Auto `changelevel` / moving a whole server to the match map.
- Silent teleport of opponents mid-pug (first join). Same-server **reconnect** after they already accepted **is** auto-slot.
- Mid-match substitutes.
- Item schema whitelist (unless already on the box).
- Replacing the website match page (comms, schedule, bans stay there).
- Using pug ELO as league ranking.
- Running official matches on unofficial servers.
- Automatic scheduling (“play at 21:00 UTC”) — this RFC is **start when you both show up**, not a calendar.
- Baking league HTTP, league timers, or league Steam IDs into `mge.smx`.
- A history table of expired claims.
- Website declaring a fight dead, forfeiting, or reverting `LIVE` because an optional live push stopped.
- Recovering from `mge_league` crash while MGEMod keeps going (E72).
- Stealing an active public fight to start a league match (D33).

---

## Open decisions

Locked rows were moved to the top of this RFC. What is still unset:

| ID  | Question                                         | Options                                                                    | Lean                                                                                                                    |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| D3  | Command name?                                    | `!league` `!match` `!play`                                                 | `!league`                                                                                                               |
| D5  | Unrated — native vs cfg-only arenas              | `MGE_SetArenaRated` / special cfg arenas                                   | Native (0a)                                                                                                             |
| D6  | Frag limit override                              | `MGE_SetArenaFragLimit` / duplicate cfg                                    | Native (0a)                                                                                                             |
| D7  | 1v1 ready check                                  | Coordinator menu / add 1v1 ready to MGEMod                                 | Coordinator menu                                                                                                        |
| D8  | Forfeit scoreboard                               | FF match / keep frag score / void                                          | FF match, note in comms, store frags as evidence                                                                        |
| D10 | Claim TTL                                        | 5 / 15 / 30 min                                                            | 15 min                                                                                                                  |
| D12 | Spec during LIVE                                 | Anyone / staff only / nobody                                               | Anyone v1                                                                                                               |
| D13 | Region lock                                      | Strict / show greyed                                                       | Strict                                                                                                                  |
| D15 | Human report after plugin report                 | Dispute only / also overwrite                                              | Dispute only                                                                                                            |
| D16 | Play after week deadline if already LIVE         | Finish / abort                                                             | Finish                                                                                                                  |
| D17 | Log plugin contract                              | Optional `leagueMatchId` now                                               | Yes                                                                                                                     |
| D18 | Pug servers + managed arena vs league-only boxes | Pug + managed / league-only                                                | Pug + managed until D33 bounce hurts                                                                                    |
| D19 | Display plugin version on match page             | Badge / comms / both                                                       | Badge + audit + one match comm                                                                                          |
| D20 | i18n of menus                                    | English only / SM translations                                             | Translations from day one                                                                                               |
| D36 | 2v2: one of four disconnects past 180s           | That **team** forfeits / only that player is removed / abort whole fixture | That team forfeits if the other team still has someone on the server. Both teams missing past timeout → D30 `UNPLAYED`. |

---

## Implementation rules (when we code)

- Website: services only, no Prisma in routes. Zod on plugin payloads. Audit log claims/reports/forfeits.
- `/api/v1/league/*` uses API keys (`requireApiKey`), never player cookies.
- Plugin keys are **server-scoped** (one key cannot claim from an unknown host).
- MGEMod changes stay in `mge.inc` with append-only structs. No league identifiers in MGEMod.
- `mge_league` is a separate repo / separate `.smx`. It never writes the platform/Glicko DB.
- After website work: `bun run format`, `check`, `boundary-check`, `knip`, tests for claim races and double report.

---

## Iteration log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-11 | First draft from brainstorm: happy path, architecture (separate plugin + website SoT), session state, API sketch, log linking, edge-case catalog E1–E65, open decisions D1–D20, phased plan.                                                                                                                                                                                                                             |
| 2026-09-11 | Iteration 2: join menu on connect; any roster member may start, roster-only arena; no MatchSession history (statuses + live fields on `Match`); 180s reconnect; hold + set-score MGEMod primitives (agnostic); coordinator own repo from day one. E66. Opens D21–D23. Phase 0a.                                                                                                                                          |
| 2026-09-11 | Iteration 3: D21 both-ready after DC then frozen score; D22 match mode from starter-in-arena through DC wait; D23 No = no re-prompt + notify waiter. Drop Lock/Hold natives: add/remove Stop is enough for randoms; `Timer_StartDuel`/`ResetArenaScores` is the real MGEMod gap. Opens D24 (skip-autostart shape).                                                                                                       |
| 2026-09-11 | Iteration 4: lock D24 (`MGE_OnArenaDuelStart` + `MGE_StartCountDown`). Lock D26 (blockable `MGE_OnArenaEarlyLeave` — training cfg threshold 3 makes D21 impossible otherwise). Lock D27 (180s ends on rejoin; then ready clock). D23 restored in locked table. Opens D25 (post-DC ready No/timeout), D28 (abort CLAIMED), D29 (heartbeat miss). E67–E76.                                                                 |
| 2026-09-11 | Iteration 5: website is fixture book + ledger, plugin owns the fight (drop heartbeat-kill / D29). Managed arena (D31) replaces a pile of league Stop hooks. Snapshot restore (D32). Never steal an active pug (D33). One paused log file (D34). Coordinator only its own sessions (D35). Both-gone → `UNPLAYED` (D30). Lock D25 / D28. E72 out of scope. Open D36 (2v2 team forfeit). Pair `mge-logs` RFC + parser spec. |
