# Testing Strategy Proposal

> **Status:** Proposal — not yet implemented
> **Date:** March 2026
> **Scope:** Full testing suite for the mge.tf competitive league platform

## Table of Contents

- [Current State](#current-state)
- [Goals](#goals)
- [Testing Layers Overview](#testing-layers-overview)
- [Phase 1 — Unit Tests](#phase-1--unit-tests)
- [Phase 2 — Service Integration Tests](#phase-2--service-integration-tests)
- [Phase 3 — Route & API Tests](#phase-3--route--api-tests)
- [Phase 4 — End-to-End Tests](#phase-4--end-to-end-tests)
- [Phase 5 — Component Tests](#phase-5--component-tests)
- [Phase 6 — Contract & Regression Tests](#phase-6--contract--regression-tests)
- [Infrastructure & Tooling](#infrastructure--tooling)
- [CI Integration](#ci-integration)
- [Conventions & File Organization](#conventions--file-organization)
- [Getting Started Checklist](#getting-started-checklist)

---

## Current State

The project has **zero automated tests**. Quality gates today consist of:

- `svelte-check` (type checking)
- `prettier` (formatting)
- `boundary-check` (custom script enforcing client/server import boundaries)
- `husky` + `lint-staged` (pre-commit formatting check)

No test runner, no test framework, no test database infrastructure exists in the project.

### Codebase Shape

| Area             | Count | Notes                                                                |
| ---------------- | ----- | -------------------------------------------------------------------- |
| Service files    | 36    | `src/lib/server/services/*.ts` — all business logic                  |
| Server utilities | 13    | `src/lib/server/utils/*.ts` — validation, errors, sanitization, etc. |
| Client utilities | 2     | `src/lib/utils/*.ts` — bracket labels, PostHog                       |
| Auth modules     | 5     | `src/lib/server/auth/*.ts` — Steam, Discord, permissions, API keys   |
| Route files      | ~94   | `src/routes/**` — pages, layouts, form actions, API endpoints        |
| Shared types     | ~8    | `src/lib/types/*.ts` — SessionUser, enums, interfaces                |
| UI components    | ~25   | `src/lib/components/**/*.svelte` — buttons, cards, forms, layout     |

---

## Goals

1. **Catch regressions before deployment** — the primary goal. A failing test should block merges.
2. **Protect critical business logic** — signup flows, match scoring, payments, auth enforcement.
3. **Enforce architectural rules mechanically** — auth guards on every protected route, no raw Prisma in responses, input validation on every action.
4. **Enable confident refactoring** — the codebase has documented architectural gaps that need closing. Tests make that migration safe.
5. **Keep tests maintainable** — co-locate tests with source, prefer testing behavior over implementation, avoid excessive mocking.

### Non-Goals

- 100% code coverage (we target high coverage on critical paths, not vanity metrics)
- Testing Prisma itself or Zod itself (we test _our usage_ of them)
- Visual pixel-perfect testing in v1 (deferred to Phase 6)

---

## Testing Layers Overview

```
Layer 6: Contract & Visual Regression   (schema stability, screenshot diffs)
Layer 5: Component Tests                (Svelte components in isolation)
Layer 4: End-to-End Tests               (full browser flows via Playwright)
Layer 3: Route & API Tests              (load functions, form actions, API handlers)
Layer 2: Service Integration Tests      (business logic against real database)
Layer 1: Unit Tests                     (pure functions, no I/O)
```

Each layer builds on the confidence of the one below it. Implement them in order.

| Layer              | Tool                            | Speed             | Confidence                        | Effort to set up |
| ------------------ | ------------------------------- | ----------------- | --------------------------------- | ---------------- |
| 1. Unit            | Vitest                          | ~ms per test      | Logic correctness                 | Low              |
| 2. Integration     | Vitest + test DB                | ~100ms per test   | Business rules + data integrity   | Medium           |
| 3. Route/API       | Vitest + SvelteKit helpers      | ~50ms per test    | Auth, validation, response shape  | Medium           |
| 4. E2E             | Playwright                      | ~seconds per test | Full user flow correctness        | High             |
| 5. Component       | Vitest + testing-library/svelte | ~ms per test      | UI rendering correctness          | Low-Medium       |
| 6. Contract/Visual | Vitest + Playwright screenshots | Varies            | API stability, visual consistency | Medium           |

---

## Phase 1 — Unit Tests

**Goal:** Test all pure functions that have zero database or network dependencies. This is the highest ROI work — fast to write, fast to run, catches the most common bugs.

**Timeline estimate:** 2-3 days for setup + full coverage of targets below.

### Tooling Setup

Install Vitest (integrates natively with the existing Vite config):

```bash
bun add -d vitest
```

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // ... existing plugins ...
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
```

Add script to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Target Files & What to Test

#### 1. `src/lib/server/utils/steamid.ts` — Steam ID conversions

**Why critical:** Steam ID is the identity system. A conversion bug breaks auth and profile lookups.

| Function                 | Test cases                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `steamId64FromSteamId32` | Valid STEAM_0:1:123456 → correct 64-bit ID; wrong segment count throws; NaN parts throw     |
| `steamId32FromSteamId64` | Valid 76561198012345678 → correct 32-bit format; ID below base throws                       |
| `isValidSteamId64`       | 17-digit valid IDs; too short/long; non-numeric; below minimum range; at boundary           |
| `isValidSteamId32`       | Valid STEAM_0:0:0 through STEAM_5:1:999999; missing prefix; wrong Y value; negative Z       |
| `extractSteamId64`       | Raw 64-bit ID; 32-bit ID; profile URL; custom URL → null; whitespace trimming; empty string |
| **Roundtrip**            | `steamId32FromSteamId64(steamId64FromSteamId32(id))` returns original id                    |

**Mocking needed:** None. Pure functions.

#### 2. `src/lib/server/utils/matchHelpers.ts` — Match logic

**Why critical:** Core league logic. Win/loss math affects standings. Time-based dispute windows affect fairness.

| Function                 | Test cases                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `calculateWeekLabel`     | Single match in week → no suffix; multiple matches → "1a", "1b"; null weekNo → null; match not in siblings → plain number |
| `formatMatchDateTime`    | Valid Date object; ISO string; null → "TBD"; invalid date string → "Invalid Date"                                         |
| `calculateTimeRemaining` | Future deadline → "HH:MM:SS" format; past deadline → "00:00:00"; exactly at deadline                                      |
| `getMatchStatusLabel`    | Status 0/1/2 → correct labels; unknown status → "Unknown"                                                                 |
| `canDisputeMatch`        | PLAYED + within 24h → true; PLAYED + after 24h → false; UNPLAYED → false; no submittedAt → false; exactly at 24h boundary |
| `canRescheduleMatch`     | UNPLAYED → true; PLAYED → false; DISPUTED → false                                                                         |
| `calculateWinLossRatio`  | 10 wins 5 losses; 0 losses → returns wins; 0 wins → 0; both 0 → 0                                                         |
| `calculatePointsPerGame` | Normal case; zero games → 0                                                                                               |
| `getTimeRemainingInfo`   | Null timestamp → N/A inactive; active timer; expired timer                                                                |

**Mocking needed:** `vi.useFakeTimers()` for `calculateTimeRemaining`, `canDisputeMatch`, and `getTimeRemainingInfo`. The `Match` type parameter can be passed as a plain object with only the needed fields (cast via `as unknown as Match`).

#### 3. `src/lib/server/utils/sanitization.ts` — Input sanitization

**Why critical:** XSS prevention and input cleaning. A bypass here is a security vulnerability.

| Function               | Test cases                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `stripHtml`            | Simple tags; nested tags; self-closing tags; no tags → unchanged; script tags                              |
| `escapeHtml`           | Each special character (&, <, >, ", ', /); no special chars → unchanged; mixed content                     |
| `sanitizeText`         | HTML + whitespace → clean trimmed text                                                                     |
| `sanitizeTeamName`     | Valid names; special characters stripped; max 50 chars; leading/trailing whitespace trimmed                |
| `sanitizeAcronym`      | Letters + numbers only; forced uppercase; max 6 chars                                                      |
| `sanitizeUrl`          | Valid https URL; valid http URL; javascript: → null; ftp: → null; invalid string → null; URL normalization |
| `sanitizeForumContent` | HTML stripped; max 5000 chars                                                                              |
| `sanitizeSearchQuery`  | SQL wildcards removed (%, \_, \\); max 100 chars                                                           |
| `sanitizeFilename`     | Path traversal (../../etc/passwd); leading/trailing dots removed; special chars → underscores; max 255     |
| `normalizeWhitespace`  | Multiple spaces; tabs; newlines; mixed → single space                                                      |
| `truncate`             | Under limit → unchanged; over limit → truncated with "..."; exactly at limit                               |
| `sanitizeInteger`      | Within bounds; below min → clamped; above max → clamped; float → floored                                   |
| `sanitizeFormData`     | Multiple fields sanitized; non-string values skipped                                                       |

**Mocking needed:** None. Pure functions.

#### 4. `src/lib/server/utils/validation.ts` — Zod schemas & helpers

**Why critical:** Input validation is the security perimeter. Bad validation = bad data in the database.

| Target                   | Test cases                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `steamIdSchema`          | Valid 17-digit ID starting with 7656119; wrong length; doesn't start with 7656119; non-numeric   |
| `teamNameSchema`         | 3-50 chars with valid characters; too short; too long; invalid characters                        |
| `teamAcronymSchema`      | 2-6 alphanumeric; too short; too long; special characters rejected                               |
| `urlSchema`              | Valid URL; empty string (allowed); invalid URL                                                   |
| `submitMatchScoreSchema` | Valid scores 0-20; negative scores; scores > 20; missing fields                                  |
| `createTeamSchema`       | All valid fields; missing required fields; password too short                                    |
| `parseIntSafe`           | Number input → floored; string "42" → 42; non-numeric string → default; null/undefined → default |
| `parseBooleanSafe`       | true/false booleans; "true"/"1"/"on" strings → true; other strings → false; non-string → false   |
| `formatValidationErrors` | Multiple issues → flat object; nested paths → dot-joined keys                                    |
| `validateFormData`       | Valid data passes; invalid data throws ZodError                                                  |
| `safeValidateFormData`   | Valid → { success: true, data }; invalid → { success: false, errors }                            |

**Mocking needed:** None. Zod runs in-process.

#### 5. `src/lib/server/utils/password.ts` — Password hashing

**Why critical:** Auth security. A bug here could leak passwords or lock out users.

| Function                  | Test cases                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hashPassword`            | Returns salt:hash format; different salts for same password; output is base64                              |
| `verifyPassword`          | Correct password → true; wrong password → false; roundtrip (hash then verify)                              |
| `verifyPassword` (legacy) | Plaintext fallback: stored password without ":" → direct comparison                                        |
| `isPasswordHashed`        | Hashed password (salt:hash) → true; plaintext → false; empty string → false; single base64 segment → false |
| `generateRandomPassword`  | Default length 16; custom length; only contains charset characters; different on each call                 |

**Mocking needed:** None. Uses Node.js `crypto` directly.

#### 6. `src/lib/utils/bracket.ts` — Bracket round labels

| Function        | Test cases                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRoundLabel` | Last round → "Final"; second-to-last → "Semifinals"; third-to-last with ≥4 rounds → "Quarterfinals"; third-to-last with <4 rounds → "Round N"; early rounds → "Round N" |

**Mocking needed:** None.

#### 7. `src/lib/server/services/mapBans.ts` — Map ban logic (pure parts only)

**Why critical:** Turn-based game logic with complex state machines. A bug here ruins competitive matches.

| Function                        | Test cases                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `determineNextAction` (BO3)     | Actions 0-5 return correct ban/pick sequence; action 6+ → ""                      |
| `determineNextAction` (BO5)     | Actions 0-7 return correct sequence; action 8+ → ""                               |
| `determineNextAction` (BO7)     | Actions 0-9 return correct sequence; action 10+ → ""                              |
| `determineNextAction` (invalid) | boSeries = 1 or 9 → ""                                                            |
| `shouldSwitchTurn` (BO3)        | Each action index returns correct switch decision matching the documented pattern |
| `shouldSwitchTurn` (BO5)        | Same for BO5 pattern                                                              |
| `shouldSwitchTurn` (BO7)        | Same for BO7 pattern                                                              |

**Mocking needed:** None. Pure functions extracted from the service.

#### 8. `src/lib/server/utils/rateLimit.ts` — Rate limiting

| Target                | Test cases                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RateLimiter.check`   | First request → allowed with remaining = max-1; exhaust all requests → blocked; after window expires → allowed again      |
| `RateLimiter.consume` | Returns true when allowed, false when blocked                                                                             |
| `RateLimiter.reset`   | After reset, full quota is available again                                                                                |
| `RateLimiter.cleanup` | Expired entries are removed                                                                                               |
| `RateLimiter.destroy` | Cleanup interval is cleared                                                                                               |
| `getClientIp`         | x-forwarded-for header → first IP; x-real-ip header; no headers → "unknown"; multiple IPs in x-forwarded-for → first only |
| `checkRateLimit`      | Allowed → { allowed: true }; blocked → { allowed: false, response with 429 status and correct headers }                   |

**Mocking needed:** `vi.useFakeTimers()` for window expiry tests. Construct fresh `new RateLimiter(...)` instances per test (don't use the pre-built singletons which share state).

#### 9. `src/lib/server/auth/permissions.ts` — Authorization (pure parts)

Only the functions that don't touch Prisma. The async functions (`isTeamAdmin`, `getPermissionLevel`) belong in Phase 2.

| Function             | Test cases                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `hasRole`            | null user → false; GUEST user vs MODERATOR requirement → false; ADMIN user vs MODERATOR → true; same role → true |
| `isAdmin`            | MODERATOR → true; ADMIN → true; GUEST → false; null → false                                                      |
| `isStrictAdmin`      | ADMIN → true; MODERATOR → false; GUEST → false                                                                   |
| `isAuthenticated`    | SessionUser → true; null → false                                                                                 |
| `requireAuth`        | null → throws 401; valid user → no throw (assertion passes)                                                      |
| `requireAdmin`       | GUEST → throws 403; MODERATOR → passes; null → throws 401                                                        |
| `requireStrictAdmin` | MODERATOR → throws 403; ADMIN → passes                                                                           |
| `requireRole`        | Below required role → throws 403; at or above → passes                                                           |
| `isBanned`           | SUSPENDED → true; BANNED → true; NONE → false; WARNING → false; null user → false                                |
| `requireNotBanned`   | BANNED user → throws 403; NONE user → passes; null → throws 401                                                  |

**Mocking needed:** The error utility functions (`unauthorized`, `forbidden`) throw SvelteKit HTTP errors. Tests should assert that the thrown error has the correct status code using `isHttpError` from `@sveltejs/kit` or a try/catch pattern.

#### 10. `src/lib/server/utils/errors.ts` — Error handling

| Function                                                                                | Test cases                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AppError` subclasses                                                                   | Correct statusCode, code, name for each subclass                                                                             |
| `notFound` / `unauthorized` / `forbidden` / `badRequest` / `conflict` / `internalError` | Each throws with correct HTTP status                                                                                         |
| `handleError`                                                                           | AppError → re-throws with status; ZodError → 400; Prisma P2002 → 409; Prisma P2025 → 404; generic Error → 500; unknown → 500 |
| `assert`                                                                                | True → no throw; false → throws AppError with given status                                                                   |
| `getErrorMessage`                                                                       | HttpError → body.message; Error → message; unknown → fallback                                                                |
| `isAppError`                                                                            | AppError → true; Error → false; null → false                                                                                 |
| `tryCatch`                                                                              | Success → returns value; failure → calls handleError                                                                         |

**Mocking needed:** Mock `logger` to prevent console output during tests. SvelteKit's `error()` and `isHttpError` work in test context since they're just object constructors.

#### 11. `src/lib/server/utils/forms.ts` — Form helpers

| Function                        | Test cases                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateForm`                  | Valid FormData + schema → { success: true, data }; invalid → { success: false, errors }; non-Zod error → rethrown; arrayKeys parameter processes multi-value fields |
| `formSuccess`                   | Returns correct shape with optional data/message                                                                                                                    |
| `formError`                     | Returns fail() with error message and status                                                                                                                        |
| `validationError`               | Returns fail(400) with errors object                                                                                                                                |
| `getFormString`                 | Existing key → trimmed string; missing key → default; non-string value → default                                                                                    |
| `getFormNumber`                 | Valid number string → number; NaN → default; missing → default                                                                                                      |
| `getFormInt`                    | Floors the result of getFormNumber                                                                                                                                  |
| `getFormBoolean`                | "true"/"1"/"on" → true; other → false                                                                                                                               |
| `getFormArray`                  | Multiple values for same key → string array; non-string values filtered                                                                                             |
| `formDataToObject`              | Single values → plain keys; duplicate keys → arrays                                                                                                                 |
| `isFormSuccess` / `isFormError` | Type guards return correct booleans                                                                                                                                 |

**Mocking needed:** Mock `logger` to silence output. `FormData` is available globally in Node 18+ (which Bun supports).

### Example Test File

To illustrate the conventions, here is what a test file would look like:

```typescript
// src/lib/server/utils/steamid.test.ts
import { describe, it, expect } from 'vitest';
import {
  steamId64FromSteamId32,
  steamId32FromSteamId64,
  isValidSteamId64,
  isValidSteamId32,
  extractSteamId64,
} from './steamid';

describe('steamId64FromSteamId32', () => {
  it('converts a valid Steam ID 32 to 64', () => {
    expect(steamId64FromSteamId32('STEAM_0:1:26135082')).toBe('76561198012535893');
  });

  it('throws on wrong segment count', () => {
    expect(() => steamId64FromSteamId32('STEAM_0:1')).toThrow('Invalid Steam ID 32');
  });

  it('throws on non-numeric parts', () => {
    expect(() => steamId64FromSteamId32('STEAM_0:abc:123')).toThrow('Invalid Steam ID 32');
  });
});

describe('steamId64 ↔ steamId32 roundtrip', () => {
  const ids = ['STEAM_0:0:0', 'STEAM_0:1:26135082', 'STEAM_0:0:50000000'];

  it.each(ids)('roundtrips %s correctly', (id32) => {
    const id64 = steamId64FromSteamId32(id32);
    expect(steamId32FromSteamId64(id64)).toBe(id32);
  });
});

describe('isValidSteamId64', () => {
  it('accepts a valid 17-digit ID', () => {
    expect(isValidSteamId64('76561198012535893')).toBe(true);
  });

  it('rejects IDs shorter than 17 digits', () => {
    expect(isValidSteamId64('1234567890')).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(isValidSteamId64('7656119801253abc')).toBe(false);
  });

  it('rejects IDs below the base range', () => {
    expect(isValidSteamId64('10000000000000000')).toBe(false);
  });
});

// ... more tests for remaining functions
```

---

## Phase 2 — Service Integration Tests

**Goal:** Test service functions against a real PostgreSQL database. Services contain the core business rules — signup lifecycles, match scoring, payment processing. Unit tests can't cover these because the logic is interleaved with database operations.

**Timeline estimate:** 1 day for infrastructure, then 1-2 days per service group.

### Test Database Infrastructure

#### Docker Compose for Test DB

```yaml
# docker-compose.test.yml
services:
  test-db:
    image: postgres:17
    environment:
      POSTGRES_DB: mge_test
      POSTGRES_USER: mge_test
      POSTGRES_PASSWORD: mge_test
    ports:
      - '5433:5432'
    tmpfs:
      - /var/lib/postgresql/data # RAM-backed for speed
```

#### Test Setup Helper

Create `tests/helpers/db.ts`:

- Before all tests: run `prisma migrate deploy` against the test DB
- Before each test: start a transaction (or truncate tables)
- After each test: rollback the transaction (or truncate)
- After all tests: disconnect

The test DB URL would be set via an environment variable `DATABASE_URL_TEST` or by pointing `DATABASE_URL` to the test instance in the test config.

#### Vitest Config for Integration Tests

Separate integration tests by file naming convention (`*.integration.test.ts`) or a separate Vitest workspace/project so they can be run independently:

```typescript
// vitest.workspace.ts
export default [
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      include: ['src/**/*.integration.test.ts'],
      setupFiles: ['tests/helpers/setup-db.ts'],
      pool: 'forks', // isolate DB state between test files
    },
  },
];
```

### Target Services (Priority Order)

#### Priority 1 — Match Scoring & Standings

**File:** `src/lib/server/services/matches.ts`, `src/lib/server/services/adminMatches.ts`

| What to test                                      | Why                                        |
| ------------------------------------------------- | ------------------------------------------ |
| Score submission with valid/invalid passwords     | Incorrect scores corrupt standings         |
| Status transitions (UNPLAYED → PLAYED → DISPUTED) | Invalid transitions could break match flow |
| Standings calculation after multiple matches      | Sorting bugs affect division rankings      |
| Admin match creation with correct week assignment | Bulk operations are error-prone            |
| Dispute flow (submit → dispute → admin resolve)   | Full lifecycle must work end-to-end        |

#### Priority 2 — Signup Flows

**Files:** `src/lib/server/services/signup1v1.ts`, `src/lib/server/services/teamSignup.ts`

| What to test                                              | Why                                      |
| --------------------------------------------------------- | ---------------------------------------- |
| 1v1 signup creates single-player team with correct status | Core registration flow                   |
| 2v2 team creation with JWT join token generation          | Token must be valid and decode correctly |
| Duplicate signup prevention (same player, same season)    | Must not allow double registration       |
| Re-registration flow for returning teams                  | Different code path from new signup      |
| Status lifecycle (PENDING → ACTIVE, PENDING → REJECTED)   | State machine must be correct            |

#### Priority 3 — Payments

**Files:** `src/lib/server/services/payments.ts`, `src/lib/server/services/item-payments.ts`

| What to test                                             | Why                         |
| -------------------------------------------------------- | --------------------------- |
| Checkout team resolution (find correct team for payment) | Wrong team = wrong payment  |
| Payment status transitions                               | Double-charge prevention    |
| Item payment order creation and expiry                   | Stale orders must expire    |
| Manual payment marking with audit trail                  | Admin action must be logged |

#### Priority 4 — Team Management & Roster

**Files:** `src/lib/server/services/teamManagement.ts`, `src/lib/server/services/teamJoin.ts`, `src/lib/server/services/pendingPlayers.ts`

| What to test                                            | Why                         |
| ------------------------------------------------------- | --------------------------- |
| Join via token — valid token, expired token, wrong team | Token auth must be airtight |
| Join via password — correct/incorrect password          | Password verification       |
| Roster size limits                                      | Can't exceed max players    |
| Player removal and permission changes                   | Must not remove last admin  |
| Pending player approve/decline with audit               | Approval flow is multi-step |

#### Priority 5 — Map Bans (DB-dependent parts)

**File:** `src/lib/server/services/mapBans.ts`

| What to test                                 | Why                                  |
| -------------------------------------------- | ------------------------------------ |
| Full ban/pick phase for BO3 match end-to-end | Complex stateful flow                |
| Turn enforcement (wrong team tries to act)   | Must reject out-of-turn actions      |
| Arena already banned/picked detection        | Duplicate prevention                 |
| Map assignment to games after picks          | Games must get correct arena IDs     |
| Phase completion detection                   | Must transition correctly at the end |

#### Priority 6 — Auth & Permissions (DB-dependent)

**File:** `src/lib/server/auth/permissions.ts`

| What to test                                        | Why                                           |
| --------------------------------------------------- | --------------------------------------------- |
| `isTeamAdmin` with various membership states        | Must check active + permissionLevel correctly |
| `getPermissionLevel` for users with different roles | Must map Prisma enum correctly                |
| `requireTeamAdmin` for global admin vs team admin   | Global admin should bypass team check         |

### Test Data Factories

Create `tests/helpers/factories.ts` with builder functions:

```typescript
export function createTestUser(overrides?: Partial<UserCreateInput>) {
  return prisma.user.create({
    data: {
      steamId: randomSteamId(),
      steamUsername: `TestUser_${randomHex(4)}`,
      permissionLevel: 'GUEST',
      banStatus: 'NONE',
      ...overrides,
    },
  });
}

export function createTestTeam(overrides?: Partial<TeamCreateInput>) { ... }
export function createTestMatch(homeTeamId: number, awayTeamId: number, overrides?: Partial<...>) { ... }
export function createTestSeason(overrides?: Partial<...>) { ... }
```

These factories make tests readable and avoid repeating boilerplate setup.

---

## Phase 3 — Route & API Tests

**Goal:** Test the thin orchestration layer — load functions and form actions in `+page.server.ts` and API handlers in `+server.ts`. These tests verify that:

1. Every protected route enforces auth as its first operation
2. Every form action validates input with Zod
3. Load functions return serialized shapes (not raw Prisma objects)
4. Error responses have the correct status codes and shapes

**Timeline estimate:** 1-2 days per route group.

### Approach

SvelteKit doesn't have built-in test utilities for load/action functions, but you can import and call them directly with mocked `event` objects:

```typescript
import { load, actions } from './+page.server';

const mockEvent = {
  locals: { user: null },
  params: { id: '1' },
  request: new Request('http://localhost', {
    method: 'POST',
    body: new FormData(),
  }),
  url: new URL('http://localhost/teams/1'),
};
```

For routes that call services, you have two options:

- **Option A:** Use the real test database (same as Phase 2). This tests the full stack minus the browser.
- **Option B:** Mock the service layer. This is faster but less realistic.

Recommended: Option A for critical flows (signup, match submission, payments), Option B for simpler CRUD pages.

### What to Test

#### Auth Enforcement (Systematic)

For every `+page.server.ts` with a `load` function or actions:

```typescript
it('load throws 401 when user is null', async () => {
  await expect(load({ locals: { user: null }, ... })).rejects.toMatchObject({
    status: 401,
  });
});

it('action throws 401 when user is null', async () => {
  await expect(actions.submit({ locals: { user: null }, ... })).rejects.toMatchObject({
    status: 401,
  });
});
```

This can be semi-automated: scan all protected route files and generate test cases.

#### Form Action Validation

```typescript
it('rejects invalid team name', async () => {
  const formData = new FormData();
  formData.set('name', 'ab'); // too short
  formData.set('acronym', 'TEST');
  // ... other fields

  const result = await actions.create({ ..., request: formDataToRequest(formData) });
  expect(result.status).toBe(400);
  expect(result.data.errors.name).toBeDefined();
});
```

#### Response Shape Verification

```typescript
it('load returns serialized team (not raw Prisma)', async () => {
  const result = await load({ ... });
  // Should have plain properties, not Prisma relation objects
  expect(result.team).toEqual(expect.objectContaining({
    id: expect.any(Number),
    name: expect.any(String),
  }));
  // Should NOT have Prisma metadata
  expect(result.team).not.toHaveProperty('_count');
  expect(result.team).not.toHaveProperty('playerInTeam');
});
```

### Target Routes (Priority Order)

| Route group                              | Key tests                                                      |
| ---------------------------------------- | -------------------------------------------------------------- |
| `/signup/1v1/`, `/signup/2v2/create/`    | Auth + ban check, validation, duplicate prevention             |
| `/matches/[id]/`                         | Score submission validation, dispute action, reschedule action |
| `/teams/[id]/edit/`, `/teams/[id]/join/` | Team admin auth, password validation, roster limits            |
| `/checkout/[steamId]/`                   | Payment auth, correct team resolution                          |
| `/admin/**`                              | Admin auth enforcement on every action, audit logging          |
| `/api/v1/**`                             | API key auth, response shape contracts                         |

---

## Phase 4 — End-to-End Tests

**Goal:** Test complete user journeys through a real browser. These are the slowest tests but catch integration bugs that no other layer can — routing, cookies, SSR rendering, client-side interactivity, form submissions with real HTML.

**Timeline estimate:** 1 day for setup, 0.5-1 day per user flow.

### Tooling Setup

```bash
bun add -d @playwright/test
bunx playwright install  # downloads browser binaries
```

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'bun run build && bun run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
});
```

### Auth Strategy for E2E Tests

Steam OpenID login can't be automated directly (it requires a real Steam session). Options:

1. **Test auth bypass:** Add a dev-only route (`/auth/test-login`) that sets a session cookie for a test user. Guard it behind `APP_ENVIRONMENT !== 'production'`.
2. **Seed + cookie injection:** Generate a valid session cookie for a seeded test user and inject it via Playwright's `storageState`.
3. **Mock Steam OpenID:** In test mode, replace the Steam redirect with a local mock that returns a predetermined user.

Option 1 is simplest and most reliable. The route already exists in spirit — the project has a `/dev/` route group that's gated to non-production.

### Target User Flows

#### Flow 1: Team Creation & Join

1. Log in as user A
2. Navigate to signup → 2v2 → create
3. Fill team form (name, acronym, division, password)
4. Submit → redirected to team page
5. Copy join link
6. Log in as user B (separate browser context)
7. Visit join link → fill password → join
8. Both users appear on team roster

#### Flow 2: League Signup (1v1)

1. Log in
2. Navigate to signup → 1v1
3. Select season/region/division
4. Submit
5. Verify team appears in division standings page

#### Flow 3: Match Score Submission

1. Admin creates match between two teams
2. Team A captain logs in → navigates to match page
3. Submits scores → match shows as PLAYED
4. Standings page updates

#### Flow 4: Match Dispute Flow

1. After score submission, opposing captain disputes
2. Match shows as DISPUTED
3. Admin resolves dispute
4. Final scores applied, standings update

#### Flow 5: Admin Panel Operations

1. Log in as admin
2. Navigate to admin → teams → change team status
3. Navigate to admin → users → ban/unban user
4. Navigate to admin → matches → create match
5. Verify audit log entries appear

#### Flow 6: Payment/Checkout

1. Log in with unpaid team
2. Navigate to checkout
3. Complete PayPal sandbox flow (or item payment flow)
4. Team status changes to paid
5. Payment appears in user payment history

### Page Object Pattern

Organize E2E tests with page objects for maintainability:

```
tests/e2e/
├── fixtures/
│   └── auth.ts              # test login helper
├── pages/
│   ├── signup.page.ts        # signup page interactions
│   ├── team.page.ts          # team page interactions
│   ├── match.page.ts         # match page interactions
│   └── admin.page.ts         # admin panel interactions
├── signup.spec.ts
├── match.spec.ts
└── admin.spec.ts
```

---

## Phase 5 — Component Tests

**Goal:** Test Svelte components in isolation — verify rendering, props, events, and accessibility without a full app context.

**Timeline estimate:** 0.5 day for setup, then incremental as components change.

### Tooling Setup

```bash
bun add -d @testing-library/svelte @testing-library/jest-dom jsdom
```

Add to Vitest config:

```typescript
{
  test: {
    name: 'components',
    include: ['src/lib/components/**/*.test.ts'],
    environment: 'jsdom',
  },
}
```

### Target Components

#### Shared UI Kit (highest value — used everywhere)

| Component              | What to test                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button.svelte`        | Renders each variant (primary, secondary, danger, success, warning, ghost) with correct classes; renders `<a>` when `href` is provided; disabled state; size variants (sm, md, lg) |
| `Card.svelte`          | Padding variants (none, sm, md, lg); custom class passthrough                                                                                                                      |
| `Badge.svelte`         | Color variants; size variants; text content                                                                                                                                        |
| `FormInput.svelte`     | Label/input association; required attribute; value binding; error state display                                                                                                    |
| `FormSelect.svelte`    | Options rendering; selected value; label association                                                                                                                               |
| `ConfirmDialog.svelte` | Open/closed state; onConfirm callback; onCancel callback; variant affects button style                                                                                             |
| `Dialog.svelte`        | Open/closed state; title rendering; close button                                                                                                                                   |

#### Layout Components

| Component                   | What to test                                       |
| --------------------------- | -------------------------------------------------- |
| `AnnouncementBanner.svelte` | Renders announcement text; dismissible; links work |

#### Complex Interactive Components (if they exist as isolated components)

| Component      | What to test                                                         |
| -------------- | -------------------------------------------------------------------- |
| Bracket viewer | Renders correct number of rounds; match cards show team names        |
| Map ban UI     | Shows available/banned/picked states; fires correct events on action |

### Example Component Test

```typescript
// src/lib/components/ui/Button.test.ts
import { render, screen } from '@testing-library/svelte';
import { expect, it, describe } from 'vitest';
import Button from './Button.svelte';

describe('Button', () => {
  it('renders as a button by default', () => {
    render(Button, { props: { children: 'Click me' } });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders as an anchor when href is provided', () => {
    render(Button, { props: { href: '/leagues', children: 'Leagues' } });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/leagues');
  });

  it('applies primary variant classes', () => {
    render(Button, { props: { variant: 'primary', children: 'Save' } });
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary');
  });

  it('is disabled when disabled prop is true', () => {
    render(Button, { props: { disabled: true, children: 'Save' } });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Priority

Component tests are lower priority than Phases 1-4 because:

- The project's complexity is overwhelmingly server-side
- Components are mostly presentational wrappers around Tailwind classes
- Bugs in components are caught visually during development

Add component tests when: modifying the shared UI kit, adding complex interactive components, or after a component bug reaches production.

---

## Phase 6 — Contract & Regression Tests

### 6a. API Contract Tests

**Goal:** Ensure `/api/v1/*` endpoints return stable response shapes for external consumers (bots, Discord integrations).

For each public API endpoint, define the expected response schema and test against it:

```typescript
// tests/contracts/api-v1-users.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const UserResponseSchema = z.object({
  steamId: z.string(),
  username: z.string(),
  permissionLevel: z.enum(['GUEST', 'MODERATOR', 'ADMIN']),
  // ... expected fields
});

describe('GET /api/v1/users/:steamId', () => {
  it('returns a valid user shape', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/users/${testSteamId}`, {
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
    const data = await response.json();
    expect(() => UserResponseSchema.parse(data)).not.toThrow();
  });
});
```

These tests run against a live (test) server and catch accidental breaking changes to API contracts.

### 6b. Visual Regression Tests (Optional)

**Goal:** Screenshot key pages and components to detect unintended visual changes.

```typescript
// tests/e2e/visual.spec.ts
import { test, expect } from '@playwright/test';

test('league standings page matches snapshot', async ({ page }) => {
  await page.goto('/leagues/2v2');
  await expect(page).toHaveScreenshot('league-standings.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

Visual regression is most useful for:

- The shared component library (render all variants, screenshot)
- Key public pages (homepage, league standings, team profile)
- After design token changes in `app.css`

**Defer this until:** The design system is stable and you're no longer making frequent visual changes.

### 6c. Performance Baseline Tests (Optional, Long-Term)

**Goal:** Establish performance baselines and alert on regressions.

Tool options: [k6](https://k6.io/) or [Artillery](https://artillery.io/) against the staging environment.

Key scenarios:

- League standings page under 50 concurrent users
- SSE notification stream with 100 connected clients
- Match score submission under concurrent load
- Admin pages with large dataset pagination

**Defer this until:** You have enough users that performance is a real concern, or after a performance incident.

---

## Infrastructure & Tooling

### Package Installation (Phase 1)

```bash
bun add -d vitest
```

### Package Installation (Phase 2+)

```bash
bun add -d vitest @vitest/coverage-v8
# For component tests:
bun add -d @testing-library/svelte @testing-library/jest-dom jsdom
# For E2E tests:
bun add -d @playwright/test
```

### Vitest Configuration

The complete Vitest config covering all phases:

```typescript
// vite.config.ts (extended)
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
    environment: 'node',
  },
});
```

For workspace-style separation (unit vs integration vs component):

```typescript
// vitest.workspace.ts
export default [
  {
    extends: './vite.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts'],
      environment: 'node',
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'integration',
      include: ['src/**/*.integration.test.ts'],
      environment: 'node',
      setupFiles: ['tests/helpers/setup-db.ts'],
      pool: 'forks',
      testTimeout: 30000,
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'components',
      include: ['src/lib/components/**/*.test.ts'],
      environment: 'jsdom',
      setupFiles: ['tests/helpers/setup-dom.ts'],
    },
  },
];
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  pull_request:
    branches: [staging]
  push:
    branches: [staging]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test # unit tests only (fast)

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: mge_test
          POSTGRES_USER: mge_test
          POSTGRES_PASSWORD: mge_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://mge_test:mge_test@localhost:5433/mge_test
      - run: bun run test:integration
        env:
          DATABASE_URL: postgresql://mge_test:mge_test@localhost:5433/mge_test

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    # ... Playwright setup with test server
```

### Script Summary

| Script                     | Purpose                         | When to run                 |
| -------------------------- | ------------------------------- | --------------------------- |
| `bun run test`             | Unit tests only                 | Every PR, pre-commit (fast) |
| `bun run test:integration` | Service tests against test DB   | Every PR (CI only)          |
| `bun run test:components`  | Component rendering tests       | When UI changes             |
| `bun run test:e2e`         | Playwright browser tests        | Before deploy to staging    |
| `bun run test:all`         | Everything                      | Nightly / pre-release       |
| `bun run test:coverage`    | Unit tests with coverage report | Weekly / on-demand          |

---

## Conventions & File Organization

### File Naming

| Test type        | File name pattern       | Location                    |
| ---------------- | ----------------------- | --------------------------- |
| Unit test        | `*.test.ts`             | Co-located with source file |
| Integration test | `*.integration.test.ts` | Co-located with source file |
| Component test   | `*.test.ts`             | Co-located with component   |
| E2E test         | `*.spec.ts`             | `tests/e2e/`                |
| Contract test    | `*.contract.test.ts`    | `tests/contracts/`          |

### Directory Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── utils/
│   │   │   ├── steamid.ts
│   │   │   ├── steamid.test.ts              ← unit test
│   │   │   ├── matchHelpers.ts
│   │   │   └── matchHelpers.test.ts         ← unit test
│   │   ├── services/
│   │   │   ├── matches.ts
│   │   │   ├── matches.integration.test.ts  ← integration test
│   │   │   ├── mapBans.ts
│   │   │   └── mapBans.test.ts              ← unit test (pure parts)
│   │   └── auth/
│   │       ├── permissions.ts
│   │       └── permissions.test.ts          ← unit test (pure parts)
│   ├── components/
│   │   └── ui/
│   │       ├── Button.svelte
│   │       └── Button.test.ts               ← component test
│   └── utils/
│       ├── bracket.ts
│       └── bracket.test.ts                  ← unit test
tests/
├── e2e/
│   ├── fixtures/
│   │   └── auth.ts
│   ├── pages/
│   │   └── *.page.ts
│   ├── signup.spec.ts
│   └── match.spec.ts
├── contracts/
│   └── api-v1.contract.test.ts
└── helpers/
    ├── setup-db.ts                          ← test DB lifecycle
    ├── setup-dom.ts                         ← jsdom + testing-library setup
    └── factories.ts                         ← test data builders
```

### Test Writing Guidelines

1. **Test behavior, not implementation.** Assert on outputs and side effects, not internal method calls.
2. **One assertion concept per test.** Multiple `expect()` calls are fine if they assert the same logical thing.
3. **Use descriptive test names.** `it('rejects a Steam ID with fewer than 17 digits')` > `it('test invalid id')`.
4. **Prefer `it.each` for parameterized tests.** Especially for functions like `determineNextAction` that have many input/output pairs.
5. **Don't test the framework.** Don't test that Zod validates correctly — test that your schemas reject the inputs you care about.
6. **Keep tests independent.** No test should depend on another test's side effects.
7. **Use factories for test data.** Never hardcode complex objects inline — use `createTestUser()` etc.

---

## Getting Started Checklist

This is the step-by-step guide for the first implementation session:

### Step 1: Install Vitest

```bash
bun add -d vitest
```

### Step 2: Configure Vitest in `vite.config.ts`

Add the `test` block with `include`, `environment: 'node'`.

### Step 3: Add test scripts to `package.json`

```json
"test": "vitest run",
"test:watch": "vitest"
```

### Step 4: Write the first test file

Start with `src/lib/server/utils/steamid.test.ts` — it's the simplest, most self-contained target with zero dependencies.

### Step 5: Run it

```bash
bun run test
```

### Step 6: Expand to remaining Phase 1 targets

Work through the unit test targets in this order (easiest → most complex):

1. `steamid.ts` — pure string/BigInt math
2. `bracket.ts` — single pure function
3. `sanitization.ts` — pure string transforms
4. `validation.ts` — Zod schemas + helpers
5. `matchHelpers.ts` — pure with fake timers for time functions
6. `password.ts` — async but pure (Node crypto)
7. `mapBans.ts` (pure parts) — `determineNextAction` + `shouldSwitchTurn`
8. `rateLimit.ts` — stateful but self-contained with fake timers
9. `permissions.ts` (pure parts) — needs SvelteKit error mocking
10. `errors.ts` — needs logger mock + SvelteKit error mocking
11. `forms.ts` — needs logger mock + FormData

### Step 7: Add `bun run test` to CI

Extend the existing GitHub Actions workflow (or add one) to run unit tests on every PR.

### Step 8: Update project rules

Add a workspace rule requiring tests for new utility/service code. Update `AGENTS.md` to mention the test commands.

---

## Summary

| Phase | What                           | Tooling                  | Catches                                                | Effort                         |
| ----- | ------------------------------ | ------------------------ | ------------------------------------------------------ | ------------------------------ |
| 1     | Unit tests for pure utilities  | Vitest                   | Logic bugs, edge cases, regressions in shared code     | 2-3 days                       |
| 2     | Integration tests for services | Vitest + Postgres        | Business rule violations, data integrity issues        | 1 day setup + 1-2 days/service |
| 3     | Route/API tests                | Vitest + mocked events   | Auth bypass, missing validation, wrong response shapes | 1-2 days/route group           |
| 4     | E2E tests                      | Playwright               | Full-flow failures, routing bugs, SSR issues           | 1 day setup + 0.5-1 day/flow   |
| 5     | Component tests                | Vitest + testing-library | Rendering bugs, prop handling, accessibility           | 0.5 day setup + incremental    |
| 6     | Contract + visual              | Vitest + Playwright      | API breaking changes, CSS regressions                  | Incremental                    |

**Start with Phase 1.** It requires no infrastructure, no database, no browser — just `bun add -d vitest` and writing test files next to the source. You'll have meaningful test coverage within a day.
