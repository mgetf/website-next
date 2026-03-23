# RFC: Bracket Rendering System

**Author:** Development Team  
**Date:** March 19, 2026  
**Status:** ✅ Completed  
**Completed:** March 2026 (Phase 4a). Custom Svelte bracket components built, tested, and wired to unified event schema.  
**Depended on by:** [`tournament-unification.md`](tournament-unification.md) ✅

---

## Summary

MGE.tf currently links to external bracket services (BracketHQ, Challonge) to display tournament brackets. This proposal designs an in-house bracket rendering system — the UI components, service layer, and data flow — that renders brackets natively from the unified event schema defined in [`tournament-unification.md`](tournament-unification.md) AND from the existing league playoff system.

The bracket renderer is a shared presentation layer that serves three contexts:

1. **Historical tournament events** — rendering imported bracket data for cups, championships, and fight nights
2. **League playoffs** — rendering playoff brackets for each league season (1v1 and 2v2)
3. **Future live tournaments** — real-time bracket updates from an automated tournament orchestration engine

This document must be completed and planned (via Cursor Plan mode) before the tournament unification migration can begin, because the bracket renderer validates the schema against real rendering needs.

---

## Decision: Custom Build Over Third-Party Libraries

An evaluation of existing bracket rendering libraries concluded that none are suitable for mge.tf's requirements. The decision is to build custom Svelte components.

### Libraries Evaluated

| Library                                                | Format Support                        | Why Not                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BracketUI** (`sagarmusabbir/bracketui`)              | None                                  | Not a bracket library at all — generic React UI kit. The name "Bracket" refers to the company, not tournaments.                                                                                                                                                                                                            |
| **brackets-viewer.js** (`Drarig29/brackets-viewer.js`) | Single elim, double elim, round-robin | Renders via imperative `document.createElement()` — conflicts with Svelte's reactive model. SCSS light-theme defaults conflict with our dark Tailwind design tokens. Data model has hardcoded `opponent1`/`opponent2` (no 2v2 support). Stale toolchain (Node 14, TypeScript 4.6, Webpack). No tests (`"test": "exit 0"`). |
| **Bracketry** (`sbachinin/bracketry`)                  | Single elim only                      | Supports 2v2 via `Contestant.players[]` array (designed for tennis doubles). Elegant API with 50+ customization options. But single elimination only — "double elimination is possible but won't look nice". No Svelte integration.                                                                                        |
| **Gracket** (`Zettersten/jquery.gracket.js`)           | Single elim only                      | Best Svelte integration — dedicated Svelte 5 runes adapter with `$state`/`$effect`. Modern toolchain (Vite, Vitest, TS 5.6). Dark ESPN-style theme. 8.5KB gzipped. But single elimination only — no double elim, round-robin, or flat card.                                                                                |

### Why Custom Wins

1. **No library covers all four formats** (single elim, double elim, round-robin, flat card). Any library choice still requires building 2-3 formats custom.
2. **Two data sources.** The bracket renderer must consume both the unified event schema (`EventMatch`) and the existing league match model (`Match` with `homeTeamId`/`awayTeamId`). Any library requires two separate translation layers.
3. **Svelte reactivity is critical.** Live tournament updates need reactive `$state` arrays that Svelte diffs automatically. Imperative DOM libraries fight this model — they own a DOM subtree that Svelte can't see or transition.
4. **Design token integration.** Components should use `bg-surface-card`, `border-border-default`, `text-text-body` etc. directly. Every library brings its own visual language (SCSS, ESPN-red, light-theme defaults) that must be overridden.
5. **The `MatchCard` must be shared.** The same match card component should work in bracket view, match list view, and match detail view. A library renders its own opaque match elements.
6. **2v2 support.** Our `EventMatchPlayer` side-based model (N rows per side) handles 1v1 and 2v2 identically. Most libraries hardcode `opponent1`/`opponent2` or `team1`/`team2`.
7. **Scope is manageable.** The rendering system is ~6 Svelte components. Two of the four formats (flat card, round-robin) are trivially simple. The complex work is CSS connector lines for elimination brackets, which is a well-documented CSS pattern.

---

## Data Sources and Presentation Interface

The bracket components are **presentation-layer only** — they accept a generic UI data structure and know nothing about Prisma, the database, or which system produced the data. Two service-layer mappers translate from the actual data sources into this shared shape.

### Presentation Interface

The components consume these types (defined in `$lib/types/bracket.ts`):

**`BracketData`** — the top-level structure passed to a bracket renderer:

- `format`: `'single_elim' | 'double_elim' | 'round_robin' | 'card'`
- `rounds`: array of `BracketRound` (ordered by round number)
- `title?`: display name of the bracket/stage
- `status`: `'upcoming' | 'in_progress' | 'completed'`

**`BracketRound`** — a round within a bracket:

- `number`: round index (1-based for display)
- `label`: display name ("Round 1", "Quarterfinals", "Upper Round 2", "Grand Final")
- `matches`: array of `BracketMatch` (ordered by `position`)

**`BracketMatch`** — a single match:

- `id`: unique identifier (for keying, linking, click handlers)
- `round`: round number
- `position`: order within round (used for connector line math)
- `side1`: `BracketSide`
- `side2`: `BracketSide`
- `bestOf?`: series length (Bo3, Bo5)
- `status`: `'upcoming' | 'live' | 'completed'`
- `isBye`: whether one side is a bye placeholder
- `label?`: optional match label ("Main Event", "WB 1.1")
- `games?`: array of `BracketGame` for BoX detail display
- `href?`: link to match detail page

**`BracketSide`** — one side of a match:

- `label`: primary display name ("Team Fortress", "Ryan / Fancy", "BYE")
- `players?`: array of `{ name, steamId, avatarUrl?, href? }` (for per-player rendering in 2v2)
- `score?`: match score
- `isWinner?`: whether this side won
- `seed?`: seeding position
- `href?`: link to team/player profile

**`BracketGame`** — a single game within a BoX series:

- `gameNumber`: 1-based
- `side1Score`: score for side 1
- `side2Score`: score for side 2
- `arena?`: map/arena name

### Data Source: Unified Events

The event service maps from the `EventMatch` + `EventMatchPlayer` schema (defined in [`tournament-unification.md`](tournament-unification.md)) to the presentation interface. The mapper function lives in the event service layer:

- Fetches all `EventMatch` rows for an event, ordered by `round` and `orderNum`
- Joins `EventMatchPlayer` rows grouped by `side` (1 or 2) to build each `BracketSide`
- Joins `EventGame` rows for BoX detail
- Groups matches into rounds by the `round` column
- Generates round labels based on `BracketFormat` and round count (e.g., "Quarterfinals" for `round = total - 2` in single elim)
- Detects bye matches from player data (username "BYE" or missing side)

### Data Source: League Playoffs

The league playoff mapper converts from the existing `Match` model (with `homeTeamId`/`awayTeamId`, `playoffRound`, `playoffId`) to the same presentation interface:

- Fetches all `Match` rows where `playoffId` is set for a given season, ordered by `playoffRound`
- Maps `homeTeam` to `side1` and `awayTeam` to `side2`
- Groups matches into rounds by `playoffRound` (positive = upper bracket, negative = lower bracket for double elim)
- Generates round labels from the existing `getPlayoffRounds()` helper in the playoffs service
- For 2v2 leagues, populates `BracketSide.players` with team roster members
- Maps `winnerScore`/`loserScore` using `winnerId` to determine which side won (same semantics as the championship data issue documented in tournament-unification.md)

### Why This Separation Matters

The components never import from `$lib/server/`. The types live in `$lib/types/bracket.ts` (client-safe, per the client/server boundary rule). The mappers live in service files. This means:

- Components work identically whether the data came from events, leagues, or fixture files
- Testing uses fixture data in the presentation format — no database needed
- A future tournament orchestration engine pushes updates as `BracketMatch` objects via SSE — the components don't care where the data originated
- If the database schema changes, only the mapper functions change — the components are untouched

---

## Component Architecture

### Component Tree

```
BracketRenderer (format router)
├── EliminationBracket (single_elim / double_elim)
│   ├── BracketStage (winners bracket, losers bracket, grand final)
│   │   ├── BracketRound (column of matches for one round)
│   │   │   ├── MatchCard (individual match)
│   │   │   │   ├── MatchSide (one side: name, score, seed, players)
│   │   │   │   └── MatchSide
│   │   │   └── ConnectorLines (CSS pseudo-elements for bracket connections)
│   │   └── BracketRound ...
│   └── BracketStage ...
├── FightCard (card format)
│   └── MatchCard ...
├── RoundRobinGroup (round_robin format)
│   ├── StandingsTable
│   └── MatchGrid (optional)
└── (shared)
    └── MatchCard (used by all formats)
```

### Component Descriptions

**`BracketRenderer.svelte`** — Top-level router. Receives `BracketData` and delegates to the appropriate format component based on `format`. This is the single entry point used by all pages that display brackets.

**`EliminationBracket.svelte`** — Renders single or double elimination brackets. For single elim: one `BracketStage` (the main bracket) plus an optional third-place match. For double elim: a winners `BracketStage`, a losers `BracketStage`, and a grand final `BracketStage`. Handles the overall horizontal layout — stages stack vertically (winners on top, losers below) with the grand final column adjacent to the winners bracket's last round.

**`BracketStage.svelte`** — A single bracket stage (e.g., "Winners Bracket", "Losers Bracket"). Contains a horizontal row of `BracketRound` components. Owns the CSS grid/flex container that positions rounds side by side.

**`BracketRound.svelte`** — A vertical column containing a round header label and a list of `MatchCard` components. Match cards are vertically centered using flexbox so that they align with their parent matches from the previous round (this alignment is what makes connector lines work).

**`MatchCard.svelte`** — The core shared component. Renders two `MatchSide` rows in a card container. Displays match status (upcoming/live/completed), BoX indicator, optional match label. Handles the "BYE" display when `isBye` is true (muted styling, no score). Emits click events for match detail navigation. This component is reused across all bracket formats AND in non-bracket contexts (match lists, match history tables).

**`MatchSide.svelte`** — One row within a `MatchCard`. Shows seed badge, side label (team name or player name), player avatars (for 2v2), and score. Applies winner/loser styling (bold name + green score for winner, dimmed + red for loser). For 2v2, shows both player names and avatars within the side.

**`FightCard.svelte`** — Trivial component. Renders fight night flat matchup lists. An ordered vertical list of `MatchCard` components, optionally with display-order labels ("Main Event", "Co-Main Event"). No connector lines, no round structure.

**`RoundRobinGroup.svelte`** — Renders round-robin group stages. Contains a `StandingsTable` (W/L/D records, points) and optionally a match grid showing results between all participants in the group. Used for league group stages and future round-robin tournaments.

**`StandingsTable.svelte`** — A table showing participant rankings within a group. Columns: rank, name, W, L, D, points, game differential. Sortable by points. Links participant names to their profiles.

### 1v1 vs 2v2 Rendering

The `MatchSide` component handles both formats identically through the `players` array:

- **1v1**: `players` has one entry. The side label is the player name. A single avatar is shown.
- **2v2**: `players` has two entries. The side label is the team name. Both player names and avatars are shown in a compact layout within the side row.
- **Team events without individual player data** (legacy cups): `players` may be empty. Only the side label is shown.

The components never check "is this 1v1 or 2v2?" — the presentation interface handles this via the `players` array length.

---

## Rendering Strategies

### Single Elimination Layout

The bracket flows **left to right**. Each round is a vertical column. Matches within a column are vertically distributed using flexbox so that each match aligns between its two feeder matches from the previous round.

```
Round 1          Round 2          Semifinals       Final
┌─────────┐
│ Match 1  │──┐
└─────────┘  │  ┌─────────┐
             ├──│ Match 5  │──┐
┌─────────┐  │  └─────────┘  │
│ Match 2  │──┘               │  ┌─────────┐
└─────────┘                   ├──│ Match 7  │──┐
                              │  └─────────┘  │  ┌─────────┐
┌─────────┐                   │               ├──│ Final    │
│ Match 3  │──┐               │               │  └─────────┘
└─────────┘  │  ┌─────────┐  │               │
             ├──│ Match 6  │──┘               │
┌─────────┐  │  └─────────┘                   │
│ Match 4  │──┘                               │
└─────────┘
```

**Vertical spacing**: Each round's matches use `flex: 1` within the column container. The first round has the most matches (tightly packed). Each subsequent round has half the matches, so flexbox automatically centers them between their feeders. This is the standard flexbox bracket layout pattern — no explicit Y-coordinate calculation needed.

**Horizontal spacing**: A fixed gap between round columns (e.g., `--bracket-round-gap: 3rem`). This gap also provides space for connector lines.

### Connector Lines (CSS-Only Approach)

Connector lines between rounds are drawn using CSS `::before` and `::after` pseudo-elements on match card containers. No SVG, no Canvas, no JavaScript.

**How it works:**

Each match card in rounds 2+ has a `::before` pseudo-element that extends leftward into the gap, drawing a horizontal line from the left edge of the card into the space between rounds.

Each match card in rounds before the last has a `::after` pseudo-element that extends rightward, splitting into two paths to connect to the two child matches in the next round:

- A horizontal segment extending rightward from the match card
- A vertical segment that spans from the top child to the bottom child
- The vertical segment is positioned at the midpoint of the gap

The vertical span is achieved by setting:

- Odd-numbered matches: `border-top` + `border-right` on `::after` (connecting downward to the parent)
- Even-numbered matches: `border-bottom` + `border-right` on `::after` (connecting upward to the parent)

This is the same technique used by brackets-viewer.js and widely documented as the standard CSS bracket connector pattern. It works because the flexbox vertical centering guarantees that a parent match is vertically centered between its two children.

**Losers bracket connector variation**: In double elimination, the losers bracket has alternating connection patterns. Even rounds connect "straight" (1:1 mapping from previous round), odd rounds connect "square" (2:1 merge). The connector CSS uses the round number to determine the pattern, following the same approach as brackets-viewer.js.

### Double Elimination Layout

Rendered as two stacked `BracketStage` components plus a grand final:

```
┌─────────────────────────────────────────────────────┐
│  Winners Bracket                                     │
│  Round 1 → Round 2 → Winners Final ──┐              │
└─────────────────────────────────────────│─────────────┘
                                          │  Grand Final
┌─────────────────────────────────────────│─────────────┐
│  Losers Bracket                         └──┤          │
│  LR1 → LR2 → LR3 → LR4 → Losers Final ───┤          │
└─────────────────────────────────────────────┘─────────┘
```

The winners bracket final's output connects to the grand final via a straight horizontal connector. The losers bracket final's output also connects to the grand final. The grand final may be a single match (if the winners bracket finalist wins) or a reset match (if the losers bracket finalist wins the first grand final game).

**League double elimination**: The existing `playoffRound` column already encodes this — positive rounds are upper bracket, negative rounds are lower bracket. The mapper groups matches by sign to populate the two stages.

### Round-Robin Layout

Not a bracket tree — rendered as a group container with:

1. **Standings table**: Rows sorted by points (descending). Columns for W/L/D, points, game differential. Used for both league group stages and future round-robin tournaments.
2. **Match grid** (optional): An NxN grid where each cell shows the result between two participants. Useful for small groups. May be omitted for larger groups in favor of a match list.

### Flat Card (Fight Night) Layout

A simple vertical list of `MatchCard` components, ordered by display order. The last matchup (highest `orderNum`) is visually emphasized as the "Main Event" with larger styling. No connector lines, no round structure.

---

## Responsive Behavior

### Large Brackets (32+ Participants)

Brackets with many rounds will overflow the viewport width. The strategy:

1. **Horizontal scroll container**: The `EliminationBracket` component wraps its stages in a horizontally scrollable container with `overflow-x: auto`.
2. **Visible rounds limit**: For very large brackets, optionally render only N rounds at a time with navigation controls (arrow buttons or swipe) to move through the bracket. This is an enhancement over the initial implementation — the first version can simply scroll.
3. **Mobile**: On small viewports, the bracket remains horizontally scrollable. Match cards compress to minimum width. An alternative mobile strategy (vertical bracket layout) may be explored later but is not in initial scope.

### Small Brackets (4-8 Participants)

Small brackets should not waste space. Match card width is fixed (via `--bracket-match-width` CSS variable), and the bracket container should shrink to fit its content rather than stretching to fill available width.

---

## Interaction Patterns

### Match Card Interactions

- **Click**: Navigates to match detail page (if `href` is set on the match). For league matches, this goes to `/matches/[id]`. For event matches, this goes to the future event match detail page.
- **Hover**: Highlights the match card border. If a participant highlighting system is implemented, hovering over a participant name highlights their path through the bracket (all their matches).
- **Live indicator**: Matches with `status: 'live'` display a pulsing indicator and may show in-progress scores.

### BYE Handling

- Bye matches render with the real participant on one side and a muted "BYE" label on the other.
- The bye side has no score, no link, and dimmed styling.
- In the bracket tree, a bye match connects to the next round normally — the non-bye participant advances.

### Score Display

- The `MatchCard` shows the series score (e.g., 2-1 in a Bo3).
- If `games` data is available, clicking or expanding the match card can show per-game scores (game 1: 20-15, game 2: 18-20, game 3: 20-12) with arena names.
- Whether this expansion is inline (popover/accordion below the match card) or navigational (link to match detail page) is a UX decision to resolve during Plan mode implementation.

---

## Real-Time / Live Data Model

### Current State (Historical Data)

For historical events and completed league playoffs, bracket data is loaded once via the page's `load` function and passed to the bracket components. No reactivity beyond initial render is needed.

### Future State (Live Tournament Orchestration)

A planned tournament orchestration engine will automate tournament progression: detecting players in-game, waiting for match completion, reporting results to the site, and advancing to the next round automatically. This imposes requirements on the bracket renderer:

**Reactive data flow**: The bracket components must reactively update when match data changes. Since the components accept `BracketData` via Svelte `$props()`, any update to the data source (whether from SSE, WebSocket, or polling) flows through Svelte's reactivity system automatically. When one match result changes in the `BracketMatch[]` array, Svelte diffs and updates only the affected `MatchCard` — no full bracket re-render.

**Progressive round revelation**: When all matches in a round complete, the next round's matches appear (initially as TBD/upcoming). The bracket grows rightward as the tournament progresses. This is handled naturally — the `rounds` array in `BracketData` grows, and the `EliminationBracket` component renders whatever rounds exist.

**Status transitions**: A match transitions through `upcoming → live → completed`. Each status has distinct visual treatment:

- `upcoming`: Muted card, "TBD" or seeded names, no score
- `live`: Highlighted border, pulsing indicator, in-progress scores
- `completed`: Normal card, final scores, winner highlight

**No component changes needed**: The bracket components are already designed for this. A `$state(bracketData)` variable that gets updated from a server event feed is all that's needed on the consumer side. The components are presentation-only and purely reactive.

### Data Flow for Live Updates

```
Game Server → Orchestration Engine → API/SSE endpoint → Client $state → BracketRenderer
```

The orchestration engine pushes match updates to an SSE or WebSocket endpoint. The client subscribes and updates the `BracketData` state. Svelte's reactivity handles the rest. The bracket components themselves have no knowledge of SSE, WebSocket, or the orchestration engine — they just render whatever `BracketData` they receive.

---

## League Integration

### Where Brackets Appear in League Context

| Page                   | What's Rendered                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| Season overview page   | Playoff bracket for the season (after regular season concludes)              |
| Division/group page    | Standings table (round-robin style) for the group stage                      |
| Match detail page      | Single `MatchCard` with game details (already exists, but could be enhanced) |
| Admin match management | Bracket visualization for playoff match creation and result tracking         |

### Mapping League Data to the Presentation Interface

The existing league `Match` model has different field names and semantics than the unified event schema:

| League field                       | Maps to                                | Notes                                          |
| ---------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `homeTeamId` / `awayTeamId`        | `side1` / `side2`                      | Team-based, not player-based                   |
| `winnerId`                         | `isWinner` on the matching side        | Compared against `homeTeamId`/`awayTeamId`     |
| `winnerScore` / `loserScore`       | `side1.score` / `side2.score`          | Requires determining which side won first      |
| `playoffRound` (positive)          | Upper bracket round number             | `round` in `BracketRound`                      |
| `playoffRound` (negative)          | Lower bracket round number             | Absolute value used for `round`                |
| `status` (UNPLAYED/PLAYED/DISPUTE) | `upcoming` / `completed` / `completed` | DISPUTE still renders as completed with scores |
| `boSeries`                         | `bestOf` on `BracketMatch`             | Direct mapping                                 |
| Team name                          | `BracketSide.label`                    | Team name as primary label                     |
| Team roster (for 2v2)              | `BracketSide.players[]`                | Join team roster to populate player details    |

### League vs Event: What's Different

The bracket components are identical for both data sources. The differences are entirely in the service layer:

- **League playoffs** have team-based sides (team name as label, roster as players). Events have player-based sides.
- **League playoffs** use `playoffRound` for round numbers and have no explicit bracket format — the `Playoff.doubleElim` flag determines the format. Events use `BracketFormat` enum.
- **League matches** link to `/matches/[id]`. Event matches will link to a future event match detail page.
- **League match creation** is manual via admin tooling. Event match creation may be automated by the orchestration engine.

---

## Testing Strategy

### Fixture Data Approach

The bracket renderer is tested entirely with fixture data in the `BracketData` format — no database, no services, no Prisma.

Fixture files provide known bracket states for each format and edge case:

| Fixture                              | Format                           | Purpose                                                  |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------- |
| `single-elim-8.json`                 | Single elim, 8 participants      | Standard small bracket, all completed                    |
| `single-elim-32.json`                | Single elim, 32 participants     | Large bracket, tests horizontal scroll and spacing       |
| `single-elim-byes.json`              | Single elim with byes            | Tests bye rendering and auto-advance display             |
| `single-elim-in-progress.json`       | Single elim, partially completed | Tests mixed status (completed + live + upcoming matches) |
| `double-elim-16.json`                | Double elim, 16 participants     | Winners + losers bracket + grand final                   |
| `double-elim-grand-final-reset.json` | Double elim with reset           | Tests the grand final reset scenario                     |
| `round-robin-4.json`                 | Round-robin, 4 participants      | Group stage with standings table                         |
| `fight-card-4.json`                  | Flat card, 4 matchups            | Fight night layout                                       |
| `2v2-single-elim-8.json`             | Single elim, 2v2, 8 teams        | Tests 2v2 player display in match cards                  |
| `live-tournament.json`               | Single elim, partially live      | Tests live indicators and progressive round revelation   |

### What to Validate

- **Visual correctness**: Connector lines align between parent and child matches
- **Format routing**: `BracketRenderer` dispatches to the correct format component
- **Status rendering**: Each match status (upcoming/live/completed) has distinct visual treatment
- **BYE handling**: Bye matches render with correct styling and don't break connector alignment
- **2v2 display**: Team names and player avatars render correctly in match sides
- **Responsive scroll**: Large brackets are scrollable without breaking layout
- **Reactivity**: Updating a match in the data array updates only that match card (no full re-render)

### Testing Method

Component tests using Vitest + `@testing-library/svelte` against the fixture data. Visual review is manual — load each fixture in a test harness page during development and iterate until the rendering looks correct.

---

## Implementation Phases

Each phase is a self-contained unit of work that delivers something testable. Phases are designed to be planned individually in Cursor Plan mode. Each phase builds on the previous one — do not skip ahead.

---

### Phase 1: Types and Fixture Data

**Goal:** Define the data contract and create test data. No components, no rendering — just the types that everything else builds against, and fixture files to develop against.

**What gets built:**

- `$lib/types/bracket.ts` — all presentation-layer types (`BracketData`, `BracketRound`, `BracketMatch`, `BracketSide`, `BracketGame`)
- Fixture JSON files for development and testing:
  - `single-elim-8.json` — 8-participant single elimination, all matches completed
  - `single-elim-byes.json` — single elimination with bye slots
  - `fight-card-4.json` — 4-matchup fight night card
  - `2v2-single-elim-8.json` — 8-team 2v2 single elimination

**What gets validated:**

- Types compile with no errors
- Fixture files conform to the types (write a simple validation script or just import them in a TypeScript file)
- The type interface feels right — can it represent every bracket state we need? Walk through each fixture mentally and confirm nothing is missing.

**Open questions to resolve:**

- Are these types complete, or does building fixtures expose missing fields?
- Is `BracketSide.players` the right shape for 2v2, or does it need more/less?

**What you know when this is done:** The data contract is locked. Every subsequent phase builds components that consume these types.

---

### Phase 2: MatchCard and MatchSide

**Goal:** Build the core shared component that every format uses. Get it looking good in isolation before putting it into any bracket layout.

**What gets built:**

- `MatchCard.svelte` — renders two `MatchSide` rows in a card container
- `MatchSide.svelte` — one row: seed badge, name/label, player avatars (2v2), score, winner/loser styling
- A temporary dev harness page (e.g., `/dev/brackets`) that renders `MatchCard` instances from fixture data in a simple vertical list — no bracket layout yet, just cards

**What gets validated:**

- 1v1 match card looks correct (player name, score, winner highlight)
- 2v2 match card looks correct (team name, both player names/avatars, score)
- BYE match card renders with muted styling
- Upcoming match (no scores, "TBD" names) renders correctly
- Completed match with winner/loser distinction renders correctly
- Live match with status indicator renders correctly
- Match card with `href` is clickable
- Match card with BoX indicator (e.g., "Bo3") displays the series info

**Open questions to resolve:**

- What exact Tailwind classes for the card container? Use `bg-surface-card`, `border-border-default`, etc. from the design token system.
- How should 2v2 player names/avatars be laid out within the constrained width of a bracket card?
- How does the BoX indicator display — inline text? Badge? Separate row?

**What you know when this is done:** The most-reused component is solid. Everything after this composes `MatchCard`.

---

### Phase 3: Single Elimination Bracket

**Goal:** Build the bracket layout for single elimination — the most complex rendering challenge. This is where connector lines, round columns, and vertical alignment all come together.

**What gets built:**

- `BracketRound.svelte` — vertical column of `MatchCard` components with a round header label
- `BracketStage.svelte` — horizontal row of `BracketRound` components with flexbox layout
- `EliminationBracket.svelte` — wraps a single `BracketStage` for single elim (double elim comes later)
- CSS connector lines between rounds (the `::before`/`::after` pseudo-element technique)
- Round label generation logic (pure TypeScript utility function: given round count and round index, return "Round 1", "Quarterfinals", "Semifinals", "Final")
- Horizontal scroll container for the bracket
- Update the dev harness page to render the `single-elim-8` and `single-elim-byes` fixtures as actual brackets

**What gets validated:**

- 8-participant bracket renders with correct connector lines between all rounds
- Matches vertically align between their feeder matches from the previous round
- BYE matches render in the bracket without breaking connector alignment
- Round headers show correct labels ("Round 1", "Semifinals", "Final")
- Bracket is horizontally scrollable when it overflows the viewport
- Small brackets (4 participants, 2 rounds) don't waste excessive space

**Open questions to resolve:**

- Does the CSS connector technique work with Tailwind CSS 4, or does it need a scoped `<style>` block?
- What are the right CSS variable values for `--bracket-match-width` and `--bracket-round-gap`?
- How does the bracket look at different viewport widths?

**Risk note:** This is the phase with the most technical uncertainty. The connector lines and vertical alignment are conceptually straightforward but may require iteration to get right. Expect this phase to take longer than the others.

**What you know when this is done:** The hardest rendering problem is solved. Single elimination brackets look good and work correctly.

---

### Phase 4: FightCard and BracketRenderer Router

**Goal:** Add the trivial flat card format and build the top-level router that dispatches by format type.

**What gets built:**

- `FightCard.svelte` — ordered vertical list of `MatchCard` components, with optional "Main Event" emphasis on the last matchup
- `BracketRenderer.svelte` — receives `BracketData`, reads `format`, and renders the appropriate component (`EliminationBracket` for `single_elim`, `FightCard` for `card`)
- Update the dev harness page to use `BracketRenderer` and render both single-elim and fight-card fixtures

**What gets validated:**

- `BracketRenderer` correctly dispatches to `EliminationBracket` for single elim data
- `BracketRenderer` correctly dispatches to `FightCard` for card data
- `FightCard` renders matchups in display order with correct styling
- The "Main Event" matchup has visually distinct emphasis

**What you know when this is done:** Two of the four formats work. The router pattern is established — adding new formats is just adding new branches.

---

### Phase 5: Double Elimination

**Goal:** Extend `EliminationBracket` to handle double elimination — winners bracket, losers bracket, and grand final.

**What gets built:**

- Extend `EliminationBracket.svelte` to accept double-elim data and render multiple `BracketStage` components (winners, losers, grand final)
- Losers bracket connector pattern (alternating straight/square connections)
- Grand final rendering (single match or reset scenario)
- New fixture file: `double-elim-16.json`
- Update the dev harness to render the double-elim fixture

**What gets validated:**

- Winners bracket renders correctly as a standard single-elim bracket
- Losers bracket renders below the winners bracket with correct alternating connector pattern
- Grand final connects to both the winners bracket final and losers bracket final
- Grand final reset scenario (2-match grand final) renders correctly
- The overall layout doesn't waste excessive vertical space

**Open questions to resolve:**

- How does the losers bracket align horizontally relative to the winners bracket? Does losers round 1 align with winners round 1, or is it offset?
- What is the exact alternating connector pattern for losers bracket rounds? Validate against real World Championship bracket data.
- What vocabulary for losers bracket round labels? ("Losers Round 1" vs "Lower Bracket Round 1")

**What you know when this is done:** All elimination formats work. Three of four formats are complete.

---

### Phase 6: Round-Robin and Standings

**Goal:** Build the round-robin display — standings table and optional match grid. This is the format used for league group stages.

**What gets built:**

- `StandingsTable.svelte` — participant ranking table (rank, name, W, L, D, points, game diff)
- `RoundRobinGroup.svelte` — wraps `StandingsTable` + optional match grid
- Add `round_robin` branch to `BracketRenderer`
- New fixture file: `round-robin-4.json`
- Update dev harness to render round-robin fixture

**What gets validated:**

- Standings table sorts correctly by points
- Participant names link to their profiles
- Match grid (if built) shows pairwise results correctly
- `BracketRenderer` dispatches to `RoundRobinGroup` for round-robin data

**What you know when this is done:** All four formats render. The component system is complete.

---

### Phase 7: Data Mappers (Service Layer)

**Goal:** Connect the components to real data. Build the service-layer functions that transform database models into `BracketData`.

**What gets built:**

- Event data mapper in the event service layer: `EventMatch` + `EventMatchPlayer` + `EventGame` → `BracketData`
- League playoff data mapper in the league service layer: league `Match` + `Team` → `BracketData`
- Integration with actual route `load` functions — replace the dev harness with real pages that render brackets from database data

**Prerequisites:** This phase cannot fully execute until the tournament unification migration (from `tournament-unification.md`) has created the `event_matches` tables and imported data. However, the league playoff mapper can be built and tested against existing league data immediately.

**What gets validated:**

- League playoff bracket renders correctly from real league match data
- Event brackets render correctly from migrated event data (after tournament unification)
- Both mappers handle edge cases: BYEs, unplayed matches, 2v2 team data, missing scores

**What you know when this is done:** Brackets render from live database data. The rendering system is production-ready.

---

### Phase 8: Polish and Edge Cases

**Goal:** Iterate on visual design, fix edge cases discovered during real-data testing, and add interaction enhancements.

**What gets built (as needed):**

- Participant path highlighting on hover (hover over a name → highlight all their matches)
- BoX game detail expansion (popover or accordion showing per-game scores)
- Visual polish — spacing, typography, responsive behavior adjustments
- Fix any connector line alignment issues discovered with real bracket data
- Fix any edge cases with non-power-of-2 brackets, incomplete brackets, or unusual data shapes

**What gets validated:**

- Every historical event bracket renders correctly
- Every league playoff bracket renders correctly
- Brackets look good at all reasonable viewport widths
- All interaction patterns work (click, hover, scroll)

**What you know when this is done:** The bracket rendering system is complete and polished.

---

### Phase Summary

| Phase                     | Builds                                                              | Depends On                    | Complexity  |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------- | ----------- |
| **1. Types + Fixtures**   | Type definitions, fixture JSON files                                | Nothing                       | Low         |
| **2. MatchCard**          | `MatchCard`, `MatchSide`, dev harness                               | Phase 1                       | Low-Medium  |
| **3. Single Elim**        | `BracketRound`, `BracketStage`, `EliminationBracket`, connector CSS | Phase 2                       | **High**    |
| **4. FightCard + Router** | `FightCard`, `BracketRenderer`                                      | Phase 2                       | Low         |
| **5. Double Elim**        | Double-elim extension of `EliminationBracket`                       | Phase 3                       | Medium-High |
| **6. Round-Robin**        | `StandingsTable`, `RoundRobinGroup`                                 | Phase 2                       | Low-Medium  |
| **7. Data Mappers**       | Service-layer mapper functions, route integration                   | Phase 4+ (all formats needed) | Medium      |
| **8. Polish**             | Interaction enhancements, visual fixes                              | Phase 7                       | Low-Medium  |

Phases 4, 5, and 6 can be done in any order after their prerequisites are met. Phase 3 is the critical path — it's the hardest work and everything else is easier once it's done.

---

## Out of Scope

- Tournament orchestration engine (separate proposal)
- SSE/WebSocket live update infrastructure
- Match editing/admin UI within the bracket (admin tools remain separate)
- Bracket printing/export
- Bracket embedding (iframe/widget for external sites)
- Mobile-specific vertical bracket layout
