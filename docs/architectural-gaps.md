# Architectural Gap Analysis: Unprotected Decisions

**Date:** March 18, 2026  
**Repository:** `mgetf/website-next`  
**Purpose:** Identify architectural patterns that are followed by convention but not enforced by tooling, documentation, or automation. Each gap is a place where a new contributor (human or LLM) could accidentally violate the project's design intent.

---

## Table of Contents

1. [How to Read This Document](#how-to-read-this-document)
2. [Gap 1: Form Actions Bypass Zod Validation](#gap-1-form-actions-bypass-zod-validation)
3. [Gap 2: Inconsistent Form Error Response Shapes](#gap-2-inconsistent-form-error-response-shapes)
4. [Gap 3: Services Coupled to SvelteKit's error() Function](#gap-3-services-coupled-to-sveltekits-error-function)
5. [Gap 4: Environment Variable Access Is Fragmented](#gap-4-environment-variable-access-is-fragmented)
6. [Gap 5: Client Code Imports from Server Boundary](#gap-5-client-code-imports-from-server-boundary)
7. [Gap 6: Catch Blocks Never Use `unknown` Typing](#gap-6-catch-blocks-never-use-unknown-typing)
8. [Gap 7: No Formatting or Linting Enforcement](#gap-7-no-formatting-or-linting-enforcement)
9. [Gap 8: No CI/CD Pipeline](#gap-8-no-cicd-pipeline)
10. [Gap 9: No Test Infrastructure](#gap-9-no-test-infrastructure)
11. [Gap 10: Load Functions Leak Prisma Internals](#gap-10-load-functions-leak-prisma-internals)
12. [Gap 11: Audit Logging Coverage Is Incomplete](#gap-11-audit-logging-coverage-is-incomplete)
13. [Gap 12: Hardcoded Format IDs in Client Code](#gap-12-hardcoded-format-ids-in-client-code)
14. [Gap 13: No Contributor Onboarding Documentation](#gap-13-no-contributor-onboarding-documentation)
15. [Priority Matrix](#priority-matrix)
16. [Execution Order: Coordinating with Active Proposals](#execution-order-coordinating-with-active-proposals)
17. [Companion Cursor Rules](#companion-cursor-rules)

---

## How to Read This Document

Each gap follows this structure:

- **The Principle**: What the codebase intends to enforce.
- **The Violation**: How and where it's currently broken.
- **Affected Files**: Specific files and line-level detail.
- **Blast Radius**: What happens if this gap is exploited by a careless contributor.
- **Remediation Approach**: Concrete steps to close the gap, scoped enough to become a work plan.
- **Deterministic Verification**: Machine-verifiable queries (grep/regex) that prove completion without relying on LLM judgment. Run before to get baseline counts, run after to confirm zero violations. These can be added to CI to prevent regression.

Severity ratings:

| Severity     | Meaning                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | A new contributor will almost certainly hit this and make the wrong choice. The codebase already has significant inconsistency. |
| **High**     | The codebase is mostly consistent but nothing prevents drift. One bad PR sets a precedent.                                      |
| **Medium**   | The risk exists but requires specific circumstances to trigger.                                                                 |
| **Low**      | Unlikely to cause damage but worth documenting for completeness.                                                                |

---

## Gap 1: Form Actions Bypass Zod Validation

**Severity: Critical**

### The Principle

All user input from form actions should be validated through Zod schemas using `validateForm()` from `$lib/server/utils/forms`. Shared schemas live in `$lib/server/utils/validation.ts`. This ensures type-safe, consistent input handling and prevents raw string casting.

### The Violation

The vast majority of form actions use raw `formData.get()` with manual type assertions (`as string`, `as number`) instead of Zod schemas. Only 3 out of ~20 route files with form actions use `validateForm`.

### Affected Files

**Files that correctly use Zod validation:**

| File                                      | Notes                                    |
| ----------------------------------------- | ---------------------------------------- |
| `src/routes/matches/[id]/+page.server.ts` | Uses `validateForm` for score submission |
| `src/routes/admin/teams/+page.server.ts`  | Uses `validateForm`                      |
| `src/routes/signup/1v1/+page.server.ts`   | Uses `validateForm` for signup           |

**Files that use raw `formData.get()` without validation (17 files):**

| File                                               | Actions affected                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/admin/league/+page.server.ts`          | createSeason, updateSeason, createRegion, createDivision, updateDivision, createArena, updateArena, deleteArena, createMapPool, updatePlayoffs, createFormat, updateFormat, deleteSeason, deleteRegion, deleteDivision, deleteFormat |
| `src/routes/admin/global/+page.server.ts`          | createAnnouncement, updateAnnouncement, toggleAnnouncement, deleteAnnouncement, updateGlobalSettings, updateSignupSeason                                                                                                             |
| `src/routes/admin/users/+page.server.ts`           | updateUser, addPunishment, clearPunishment, toggleNameLock, toggleAvatarLock, unlinkDiscord                                                                                                                                          |
| `src/routes/admin/matches/+page.server.ts`         | loadTeams, createMatches, createPlayoffMatch, updateStatus, updateScores                                                                                                                                                             |
| `src/routes/admin/matches/create/+page.server.ts`  | createMatches, createPlayoffMatch                                                                                                                                                                                                    |
| `src/routes/admin/demos/+page.server.ts`           | updateReport                                                                                                                                                                                                                         |
| `src/routes/admin/disputes/+page.server.ts`        | resolveDispute                                                                                                                                                                                                                       |
| `src/routes/admin/pending-players/+page.server.ts` | approve, decline                                                                                                                                                                                                                     |
| `src/routes/admin/+page.server.ts`                 | approve, decline                                                                                                                                                                                                                     |
| `src/routes/admin/site/+page.server.ts`            | Multiple settings/content/API key actions                                                                                                                                                                                            |
| `src/routes/teams/[id]/+page.server.ts`            | removePlayer, updateStatus, acceptInvitation, declineInvitation, leaveTeam, markPlayerPaid                                                                                                                                           |
| `src/routes/teams/[id]/edit/+page.server.ts`       | updateInfo, updateJoinPassword, uploadAvatar, removePlayer, promotePlayer, demotePlayer, invitePlayer, disbandTeam                                                                                                                   |
| `src/routes/teams/[id]/join/+page.server.ts`       | joinTeam                                                                                                                                                                                                                             |
| `src/routes/teams/join/+page.server.ts`            | accept, decline                                                                                                                                                                                                                      |
| `src/routes/invitations/+page.server.ts`           | accept, withdraw                                                                                                                                                                                                                     |
| `src/routes/signup/2v2/create/+page.server.ts`     | createTeam                                                                                                                                                                                                                           |
| `src/routes/signup/2v2/existing/+page.server.ts`   | reregisterTeam                                                                                                                                                                                                                       |
| `src/routes/tournaments/+page.server.ts`           | create, setWinners                                                                                                                                                                                                                   |

### Blast Radius

A new contributor sees 17 files doing `formData.get('x') as string` and 3 files using `validateForm`. They'll copy the majority pattern. Over time, Zod validation becomes a dead feature that exists in utilities but is never used. Input validation becomes ad-hoc and inconsistent, and bugs from unvalidated input become harder to trace.

### Remediation Approach

1. **Audit phase**: For each of the 17 files, determine which actions have simple single-field inputs (e.g., just an ID) versus complex multi-field forms that genuinely benefit from a schema.
2. **Schema creation**: For multi-field forms, create Zod schemas. Simple single-field actions (like `approve` with just an `id`) may not need a full schema — a lightweight `z.object({ id: z.coerce.number().int().positive() })` inline is sufficient.
3. **Migration**: Replace `formData.get()` + `as string` patterns with `validateForm(formData, schema)`. Use `validationError()` for failed validation.
4. **Priority order**: Start with user-facing routes (signup, team join, team edit) before admin routes, since admin routes already have `requireAdmin` as a first line of defense.

**Estimated scope**: ~17 files, 40+ individual actions. This is a large migration best done in batches grouped by domain (teams, admin, signup).

### Deterministic Verification

```powershell
# VIOLATION: files using formData.get() in route actions
rg "formData\.get\(" src/routes -g "+page.server.ts" --files-with-matches

# COMPLIANT: files that import validateForm
rg "validateForm" src/routes -g "+page.server.ts" --files-with-matches

# The diff = files still needing migration. Target: every file in set 1 also appears in set 2.

# Unsafe type assertions on form data (the most dangerous sub-pattern)
rg "formData\.get\(.+\)\s+as\s+string" src/routes -c
# Target: 0

# Can also count raw formData.get calls that aren't inside a validateForm wrapper
rg "formData\.get\(" src/routes -g "+page.server.ts" -c
# Baseline: record count before migration. Target: 0 (all access goes through validateForm).
```

**CI-enforceable:** Yes — fail if any `+page.server.ts` file contains `formData.get(` but does not contain `validateForm`.

---

## Gap 2: Inconsistent Form Error Response Shapes

**Severity: Critical**

### The Principle

Form action responses should have a predictable shape so that Svelte components can handle success and error states consistently. The project provides `formError()`, `validationError()`, and `formSuccess()` helpers in `$lib/server/utils/forms` that enforce the shape `{ success: boolean, message: string, errors?: Record<string, string> }`.

### The Violation

Three different response shapes coexist:

**Shape A — Raw `fail()` with `{ error: string }` (dominant pattern, ~80% of actions):**

```typescript
return fail(400, { error: 'Player Steam ID is required' });
```

**Shape B — Helpers with `{ success: false, message: string }` (3 files):**

```typescript
return formError('Team not found', 404);
return validationError(validation.errors);
```

**Shape C — Success with `{ success: true, message?: string }` (used everywhere for success):**

```typescript
return { success: true, message: 'Player removed successfully' };
```

The problem: error responses use `{ error }` while success responses use `{ success, message }`. Components must check for both `form?.error` and `form?.success`, and the two utility-based patterns (`formError`, `validationError`) return `{ success: false, message }` which is a third shape entirely.

### Affected Files

Every route file with form actions. The Shape A pattern (`fail(status, { error })`) appears in:

- All admin route files (league, matches, users, teams, disputes, demos, pending-players, global, site)
- All team management routes (teams/[id], teams/[id]/edit, teams/[id]/join, teams/join)
- Invitations, signup, matches, tournaments, user profiles

The Shape B pattern (`formError`/`validationError`) appears only in:

- `matches/[id]/+page.server.ts`
- `admin/teams/+page.server.ts`
- `signup/1v1/+page.server.ts`

### Blast Radius

Svelte components that consume form results must handle multiple response shapes. If a contributor adds a new action using Shape B but the component only checks `form?.error`, the error is silently swallowed. The opposite is also true — a component built for Shape B won't display Shape A errors. This leads to silent failures in the UI.

### Remediation Approach

**Option A — Standardize on Shape A (lower effort):** Since `{ error: string }` is the dominant pattern, adopt it as the standard. Deprecate `formError()` and `validationError()`. Update the 3 files using Shape B. This is the pragmatic choice.

**Option B — Standardize on Shape B (higher effort, more correct):** Migrate all actions to use `formError()`/`validationError()`/`formSuccess()`. Update all components to check `form?.success` and `form?.message`. This is the "right" choice but touches every route and component.

**Recommendation:** Option A for now, with a note that Option B is the long-term goal. The existing `formError` helpers can be refactored to return Shape A's `{ error }` format to unify both.

**Estimated scope**: If standardizing on Shape A, only 3 files need changes. If standardizing on Shape B, ~20 route files and their corresponding Svelte components need changes.

### Deterministic Verification

Depends on which shape you standardize on:

```powershell
# If standardizing on Shape A (fail + { error }), these should return 0:
rg "formError\(|validationError\(" src/routes -c
# Target: 0 (no Shape B usage in routes)

# If standardizing on Shape B (formError/validationError), these should return 0:
rg "return fail\(" src/routes -g "+page.server.ts" -c
# Target: 0 (no raw fail() usage in routes)

# Regardless of choice, verify consistency — no mixed shapes in the same file:
# Files using BOTH patterns (always a bug):
rg -l "return fail\(" src/routes -g "+page.server.ts" | ForEach-Object { if (rg -q "formError\(|validationError\(" $_) { $_ } }
# Target: 0 files
```

**CI-enforceable:** Yes — grep for the anti-pattern of whichever shape you deprecate.

---

## Gap 3: Services Coupled to SvelteKit's `error()` Function

**Severity: High**

### The Principle

Services in `src/lib/server/services/` should be framework-agnostic business logic layers. They should not depend on SvelteKit's HTTP-oriented `error()` function. The project provides framework-agnostic error utilities in `$lib/server/utils/errors` (`notFound()`, `forbidden()`, `badRequest()`, `conflict()`, `unauthorized()`) that wrap `error()` but keep the service vocabulary clean.

### The Violation

11 out of 34 service files directly import and throw `error()` from `@sveltejs/kit`:

| Service             | `throw error()` call count |
| ------------------- | -------------------------- |
| `teamManagement.ts` | 17                         |
| `teamSignup.ts`     | 14                         |
| `signup1v1.ts`      | 14                         |
| `adminMatches.ts`   | 10+                        |
| `teamJoin.ts`       | 14                         |
| `playoffs.ts`       | 12                         |
| `payments.ts`       | 5                          |
| `matches.ts`        | 6                          |
| `matchComms.ts`     | 4                          |
| `pendingPlayers.ts` | 3                          |
| `mapBans.ts`        | 7                          |

Meanwhile, `$lib/server/utils/errors` provides `notFound()`, `forbidden()`, `badRequest()`, `conflict()`, `unauthorized()` which are purpose-built for services but are underused. Additionally, `AppError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, and `ConflictError` classes are defined in `errors.ts` but never instantiated anywhere in the codebase.

### Why This Matters

If the project ever needs to reuse service logic outside of SvelteKit (e.g., a background job, a CLI migration script, or a different web framework), every `throw error(400, '...')` call would need to be rewritten. More practically, a contributor reading `errors.ts` sees a well-designed error hierarchy and assumes they should use it, then looks at actual services and sees raw `error()` calls everywhere. They don't know which pattern to follow.

### Blast Radius

New services will copy the `import { error } from '@sveltejs/kit'` pattern because it's what 11 existing services do. The error utilities and custom error classes become dead code.

### Remediation Approach

1. **Phase 1**: Replace `import { error } from '@sveltejs/kit'` in all 11 services with imports from `$lib/server/utils/errors`. Map each `throw error(400, msg)` → `badRequest(msg)`, `throw error(404, msg)` → `notFound(msg)`, `throw error(403, msg)` → `forbidden(msg)`, etc. These are drop-in replacements since the error utilities already call `error()` internally.
2. **Phase 2 (optional)**: Evaluate whether the custom error classes (`AppError`, `ValidationError`, etc.) should be adopted or removed. If they're not going to be used, delete them to avoid confusion.
3. **Add a cursor rule** to enforce that services import from `$lib/server/utils/errors`, not from `@sveltejs/kit`.

**Estimated scope**: 11 files, ~100 individual `throw error()` calls. Each replacement is mechanical — same behavior, different import. Can be done per-service in isolated PRs.

### Deterministic Verification

```powershell
# Services that import error from @sveltejs/kit (the violation)
rg "from '@sveltejs/kit'" src/lib/server/services --files-with-matches
# Target: 0 files

# Services that import from the error utilities (the target pattern)
rg "from '.*/utils/errors'" src/lib/server/services --files-with-matches
# Target: should include every service that throws errors

# Count of raw throw error() calls in services
rg "throw error\(" src/lib/server/services -c
# Target: 0

# Verify the error utilities are being used instead
rg "notFound\(|badRequest\(|forbidden\(|conflict\(|unauthorized\(" src/lib/server/services -c
# Target: should be > 0 (replaces the throw error calls)
```

**CI-enforceable:** Yes — fail if any file in `src/lib/server/services/` imports from `@sveltejs/kit`. This is the single most reliable check.

---

## Gap 4: Environment Variable Access Is Fragmented

**Severity: High**

### The Principle

Environment variables should be accessed through a centralized layer that validates their presence and provides type-safe getters. The project has this layer in `$lib/server/utils/env.ts` with `getRequiredEnv()`, `getOptionalEnv()`, `getJwtSecret()`, and `getSessionSecret()`. SvelteKit also provides `$env/dynamic/private` for runtime env access.

### The Violation

Three different access patterns coexist:

**Pattern 1 — Central env utilities (2 files):**

```typescript
import { getRequiredEnv } from '$lib/server/utils/env';
const secret = getRequiredEnv('JWT_SECRET');
```

**Pattern 2 — SvelteKit's `$env/dynamic/private` (2 files):**

```typescript
import { env } from '$env/dynamic/private';
const clientId = env.DISCORD_CLIENT_ID;
```

**Pattern 3 — Raw `process.env` (8 files):**

```typescript
const apiKey = process.env.STEAM_API_KEY;
```

### Affected Files

| File                                            | Pattern                | Variables                                                                                                                      |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/server/db.ts`                          | `process.env`          | `DATABASE_URL`                                                                                                                 |
| `src/lib/server/session.ts`                     | `process.env`          | `SESSION_SECRET`                                                                                                               |
| `src/lib/server/services/users.ts`              | `process.env`          | `STEAM_API_KEY`                                                                                                                |
| `src/lib/server/services/paypal.ts`             | `process.env`          | `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`                                                                      |
| `src/lib/server/utils/r2Upload.ts`              | `process.env`          | `S3_EU_ENDPOINT`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CLOUDFLARE_BUCKET_NAME`, `CLOUDFLARE_PUBLIC_URL` |
| `src/lib/server/utils/logger.ts`                | `process.env`          | `LOG_DIR`, `NODE_ENV`                                                                                                          |
| `src/lib/server/utils/environment.ts`           | `process.env`          | `APP_ENVIRONMENT`                                                                                                              |
| `src/routes/api/paypal/create-order/+server.ts` | `process.env`          | `PUBLIC_URL`                                                                                                                   |
| `src/routes/checkout/[steamId]/+page.server.ts` | `process.env`          | `PAYPAL_CLIENT_ID`                                                                                                             |
| `src/lib/server/auth/discord.ts`                | `$env/dynamic/private` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`                                                           |
| `src/lib/server/auth/steam.ts`                  | `$env/dynamic/private` | `STEAM_API_KEY`                                                                                                                |

Note that `SESSION_SECRET` is accessed via `process.env` in `session.ts` even though `env.ts` provides `getSessionSecret()` for exactly this purpose.

### Blast Radius

A new contributor adding a feature that needs an environment variable (e.g., a new integration) has three equally valid-looking patterns to copy. They'll pick whatever file they look at first. Over time, `env.ts` with its validation and caching becomes irrelevant, and the app silently fails at runtime when variables are missing instead of failing fast at startup.

Additionally, `validateEnvironment()` in `env.ts` is never called anywhere. It validates `JWT_SECRET` and `SESSION_SECRET` as required, but since it never runs, missing secrets only surface as runtime crashes.

### Remediation Approach

1. **Call `validateEnvironment()` at startup**: Add it to `hooks.server.ts` or the db initialization path. This is a one-line change with high impact.
2. **Decide on the canonical pattern**: The cleanest approach is to use `$env/dynamic/private` for SvelteKit server files and `env.ts` getters for deeply-nested utilities. Raw `process.env` should only appear in `db.ts` (which runs before SvelteKit's env system is available) and `env.ts` itself.
3. **Register all variables**: Add `STEAM_API_KEY`, `PAYPAL_*`, `S3_*`/`CLOUDFLARE_*`, `PUBLIC_URL`, `APP_ENVIRONMENT` to `env.ts` as either required or recommended.
4. **Migrate callers**: Replace raw `process.env` usage with either `$env/dynamic/private` or `env.ts` getters, depending on the file's location.
5. **Fix the R2/S3 naming inconsistency**: `env.ts` references `R2_*` variable names but `r2Upload.ts` uses `S3_*`. Unify them.

**Estimated scope**: ~10 files. The `env.ts` registration is quick; the caller migrations are mechanical.

### Deterministic Verification

```powershell
# Raw process.env usage outside the two allowed files (db.ts and env.ts)
rg "process\.env\." src/lib/server src/routes -g "!db.ts" -g "!env.ts" --files-with-matches
# Target: only environment.ts (reads APP_ENVIRONMENT — arguably the one allowed exception)
# Everything else should be 0.

# Verify validateEnvironment() is called at startup
rg "validateEnvironment\(\)" src/hooks.server.ts -c
# Target: 1 (called once in hooks)
```

**CI-enforceable:** Yes — fail if `process.env.` appears in any server file other than `db.ts`, `env.ts`, and `environment.ts`.

---

## Gap 5: Client Code Imports from Server Boundary

**Severity: High**

### The Principle

Files in `$lib/server/` are server-only. Client-side code (`.svelte` files, `$lib/state/`, `$lib/components/`, `$lib/utils/`) must never import from `$lib/server/`, even with `import type`. Shared types that both client and server need belong in `$lib/types/`.

### The Violation

**File:** `src/routes/users/[steamId]/+page.svelte`, line 9:

```typescript
import type { ProfileMatch } from '$lib/server/services/users';
```

`ProfileMatch` is defined in `src/lib/server/services/users.ts` (lines 331–338):

```typescript
export interface ProfileMatch {
  matchId: number;
  week: string;
  opponentName: string;
  opponentId: number;
  result: 'W' | 'L' | 'TBD';
  score: string;
}
```

There is currently no file in `$lib/types/` for match-related types. Only `$lib/types/user.ts` exists.

### Why This Matters

Even `import type` from `$lib/server/` creates a conceptual dependency from client to server code. If a bundler or future SvelteKit version enforces server-only boundaries more strictly, this import will break. More importantly, it sets a precedent: if one `.svelte` file imports types from services, contributors will do the same, gradually eroding the boundary.

### Blast Radius

Moderate. Currently only one violation exists. But without enforcement, every new type defined in a service that a component needs will be imported directly, creating invisible coupling.

### Remediation Approach

1. Create `$lib/types/match.ts` with the `ProfileMatch` interface.
2. Update `users.ts` service to import `ProfileMatch` from `$lib/types/match.ts`.
3. Update `users/[steamId]/+page.svelte` to import from `$lib/types/match.ts`.
4. Add a CI boundary check (grep for `from '$lib/server` in `.svelte` files) to prevent recurrence.
5. Establish a convention: when a service defines a type that a component needs, it goes in `$lib/types/`.

**Estimated scope**: 3 files, ~10 minutes. The CI check is the important part.

### Deterministic Verification

```powershell
# .svelte files importing from $lib/server (the violation)
rg "from '\$lib/server" src/routes -g "*.svelte" --files-with-matches
rg "from '\$lib/server" src/lib/components --files-with-matches
rg "from '\$lib/server" src/lib/state --files-with-matches
# Target: all three return 0 files

# Verify shared types exist where needed
rg "from '\$lib/types/" src/routes -g "*.svelte" --files-with-matches
# Target: should include files that previously imported from $lib/server
```

**CI-enforceable:** Yes — already in the CI workflow. Fail if any `.svelte` file imports from `$lib/server`.

---

## Gap 6: Catch Blocks Never Use `unknown` Typing

**Severity: Medium**

### The Principle

TypeScript best practice (and the project's `strict: true` config) recommends `catch (err: unknown)` over `catch (err: any)` or untyped `catch (err)`. This forces explicit narrowing before accessing error properties, preventing runtime crashes from unexpected error shapes.

### The Violation

- **0** catch blocks use `err: unknown`
- **38** catch blocks use explicit `err: any`
- **50+** catch blocks use untyped `catch (err)` or `catch (error)` (implicit `any` because the project doesn't have `useUnknownInCatchVariables` — this is separate from `strict`)

### Affected Files (sample of `err: any`)

| File                                           | Count |
| ---------------------------------------------- | ----- |
| `src/routes/teams/[id]/edit/+page.server.ts`   | 8     |
| `src/routes/users/[steamId]/+page.server.ts`   | 8     |
| `src/routes/matches/[id]/+page.server.ts`      | 8     |
| `src/routes/admin/matches/+page.server.ts`     | 5     |
| `src/routes/checkout/[steamId]/+page.svelte`   | 4     |
| `src/routes/teams/join/+page.server.ts`        | 3     |
| `src/routes/signup/2v2/create/+page.server.ts` | 2     |

### Why This Matters

With `err: any`, code like `err.message` and `err.status` compiles without complaint even if `err` is not an Error object. In SvelteKit, `error()` throws `HttpError` objects which have a different shape than standard `Error` objects. A contributor writing `err.message` when the thrown error is actually an `HttpError` (which uses `err.body.message`) will get `undefined` silently.

### Remediation Approach

1. **Enable `useUnknownInCatchVariables`** in `tsconfig.json`. This is part of the `strict` family but not enabled by default in all TypeScript versions. Verify it's active — if not, add it explicitly.
2. **Migrate catch blocks**: Replace `catch (err: any)` and `catch (err)` with `catch (err: unknown)` and add `err instanceof Error` narrowing. For SvelteKit-specific errors, use the pattern:
   ```typescript
   catch (err: unknown) {
     if (err instanceof Error) {
       return fail(500, { error: err.message });
     }
     return fail(500, { error: 'An unexpected error occurred' });
   }
   ```
3. This can be done incrementally, file by file.

**Estimated scope**: ~90 catch blocks across ~25 files. Mechanical but tedious. Could be partially automated with a codemod.

### Deterministic Verification

```powershell
# Explicit err: any (the most dangerous pattern)
rg "catch\s*\(\s*\w+\s*:\s*any" src/ -c
# Target: 0

# Untyped catch blocks (implicit any — less dangerous but still bad)
# Count all catch blocks
rg "catch\s*\(" src/ -g "*.ts" -g "*.svelte" -c
# Then count catch blocks with : unknown
rg "catch\s*\(\s*\w+\s*:\s*unknown" src/ -c
# Target: the two counts should be equal (every catch is typed as unknown)

# Alternative: if useUnknownInCatchVariables is enabled in tsconfig,
# untyped catches are already safe. Then only the explicit any matters:
rg "catch\s*\(\s*\w+\s*:\s*any" src/ -c
# Target: 0
```

**CI-enforceable:** Yes — grep for `catch.*: any`. Can also be enforced via ESLint rule `@typescript-eslint/no-explicit-any` once ESLint is configured.

---

## Gap 7: No Formatting or Linting Enforcement

**Severity: High**

### The Principle

Code formatting should be automated and enforced, not left to individual preference. Linting should catch common mistakes (unused variables, implicit any, unreachable code) that type-checking alone doesn't catch.

### The Violation

- No ESLint configuration exists (`.eslintrc` is referenced in `.dockerignore` but the file doesn't exist)
- No Prettier configuration existed (now added as part of this audit)
- No `.editorconfig` existed (now added as part of this audit)
- No format or lint step in `package.json` scripts (format scripts now added)
- No pre-commit hooks

The only automated quality check is `bun run check` (svelte-check for type errors), and it's manual — nothing prevents unformatted code from being committed.

### Blast Radius

Every contributor formats code differently. Tabs vs spaces, trailing commas, quote style — all vary across files. Code reviews become cluttered with formatting noise. LLMs generating code will use whatever default they have, introducing inconsistency.

### Remediation Approach

1. **Prettier** (now partially addressed): `.prettierrc` and `prettier-plugin-svelte` are installed. Run `bun run format` once to format the entire codebase, then enforce via CI.
2. **ESLint**: Install `eslint`, `@eslint/js`, `typescript-eslint`, and `eslint-plugin-svelte`. Configure with rules targeting the specific issues found in this audit:
   - `@typescript-eslint/no-explicit-any` (warn → error over time)
   - `@typescript-eslint/no-unused-vars`
   - `svelte/no-store` (to enforce runes over legacy stores)
   - Custom rule or config to warn on `catch (err: any)`
3. **Pre-commit hooks**: Install `husky` + `lint-staged` to run Prettier and ESLint on staged files before commit. This prevents unformatted code from ever reaching the repo.
4. **Initial formatting run**: Run Prettier across the entire codebase in a single commit before enabling enforcement. This avoids contaminating future diffs with formatting changes.

**Estimated scope**: Configuration is ~1 hour. The initial Prettier run will touch most files — do it in a dedicated commit.

### Deterministic Verification

```powershell
# Prettier — is every file formatted?
bun run format:check
# Target: exit code 0

# ESLint (once configured) — any lint violations?
bun run lint
# Target: exit code 0

# Verify configs exist
Test-Path .prettierrc
Test-Path .editorconfig
# Target: both True
```

**CI-enforceable:** Yes — `bun run format:check` already in CI. Add `bun run lint` once ESLint is configured.

---

## Gap 8: No CI/CD Pipeline

**Severity: Critical**

### The Principle

Every push and pull request should be validated automatically. At minimum: type checking, formatting, and architectural boundary enforcement.

### The Violation

No `.github/workflows/` directory existed until this audit. No automated checks run on push or PR. The only quality gate is manual `bun run check`.

A basic CI workflow has been created as part of this audit (`.github/workflows/ci.yml`) but has not been tested or activated.

### Blast Radius

Without CI, a contributor can push code that:

- Fails type checking
- Violates server/client boundaries
- Uses raw `@prisma/client` imports
- Introduces formatting inconsistencies

None of these would be caught until someone manually runs checks or the next deploy fails.

### Remediation Approach

The created CI workflow includes:

1. **Type check job**: `bun install` → `bun run generate` → `bun run prepare` → `bun run check` → `bun run format:check`
2. **Boundary check job**: Grep-based checks for:
   - No direct Prisma imports in route files
   - No `.svelte` files importing from `$lib/server/`
   - No `@prisma/client` imports (must use `$prisma` alias)
   - Warning on hardcoded format IDs

**Next steps**:

1. Push the workflow file and verify it runs on GitHub Actions.
2. Add branch protection rules on `master` requiring CI to pass.
3. Once ESLint is configured, add a lint step.
4. Once tests exist, add a test step.

**Estimated scope**: The workflow file exists. Testing it and adding branch protection is ~30 minutes.

### Deterministic Verification

```powershell
# Verify CI workflow exists
Test-Path .github/workflows/ci.yml
# Target: True

# Verify CI runs type checking (search for the command in the workflow)
rg "bun run check" .github/workflows/ci.yml -c
# Target: >= 1

# Verify CI runs format check
rg "format:check" .github/workflows/ci.yml -c
# Target: >= 1

# Verify boundary checks exist
rg "from '\\\$lib/server" .github/workflows/ci.yml -c
# Target: >= 1 (the grep pattern is in the workflow)
```

**CI-enforceable:** This gap IS the CI. Verification is simply: does the workflow file exist and does it contain the expected checks.

---

## Gap 9: No Test Infrastructure

**Severity: Critical**

### The Principle

Critical business logic should have automated tests. At minimum: service-layer unit tests for operations that involve money, scoring, access control, and data integrity.

### The Violation

- **Zero** test files in the entire repository
- No test framework in `devDependencies`
- No test scripts in `package.json`
- No test configuration

### Critical Untested Business Logic

| Domain                | Service(s)                         | Risk                                                                   |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| **Payments**          | `payments.ts`, `paypal.ts`         | Incorrect payment status, double charges, payment-without-access       |
| **Match Scoring**     | `matches.ts`, `adminMatches.ts`    | Wrong win/loss records, incorrect standings                            |
| **Roster Management** | `teamManagement.ts`, `teamJoin.ts` | Players on multiple teams, exceeding roster caps, locked roster bypass |
| **Signup Logic**      | `teamSignup.ts`, `signup1v1.ts`    | Duplicate signups, signups during closed periods                       |
| **Playoffs**          | `playoffs.ts`                      | Bracket generation errors, incorrect seeding                           |
| **Permissions**       | `permissions.ts`                   | Auth bypass, privilege escalation                                      |
| **Map Bans**          | `mapBans.ts`                       | Out-of-turn bans, invalid ban sequences                                |

### Blast Radius

Without tests, any change to business logic is a gamble. A contributor fixing a bug in `teamManagement.ts` has no way to verify they haven't broken roster locking. Refactoring service layer error handling (Gap 3) becomes dangerous because there's no safety net.

### Remediation Approach

1. **Install Vitest**: It integrates natively with Vite (already used by the project). Add `vitest` to devDependencies and a `"test": "vitest run"` script.
2. **Configure for SvelteKit**: Use `vitest.config.ts` that extends the Vite config to resolve `$lib`, `$prisma`, and other aliases.
3. **Prisma mocking strategy**: Use `vitest-mock-extended` or manual mocks for `prisma` to avoid needing a database for unit tests. For integration tests, use a test database with `prisma migrate deploy`.
4. **Priority test targets** (in order of risk):
   - `permissions.ts` — auth guard correctness
   - `payments.ts` — payment flow integrity
   - `teamManagement.ts` — roster operations
   - `matches.ts` — score submission and winner determination
   - `playoffs.ts` — bracket generation
   - `signup1v1.ts` / `teamSignup.ts` — eligibility checks
5. **Test conventions**:
   - Test files live next to their source: `services/teams.ts` → `services/teams.test.ts`
   - Use descriptive test names: `it('rejects join when roster is locked')`
   - Each service file should have at least one test covering the happy path and one covering the primary error case

**Estimated scope**: Initial setup is ~1 hour. Writing meaningful tests for the 7 critical domains is a multi-day effort — but even 10-20 targeted tests for the highest-risk paths would be a massive improvement over zero.

### Deterministic Verification

```powershell
# Does vitest exist in the project?
rg '"vitest"' package.json -c
# Target: >= 1

# Does a test script exist?
rg '"test"' package.json -c
# Target: >= 1

# Do test files exist for the critical services?
# Define the must-test list and check each:
$mustTest = @(
  "src/lib/server/services/permissions.test.ts",
  "src/lib/server/services/payments.test.ts",
  "src/lib/server/services/teamManagement.test.ts",
  "src/lib/server/services/matches.test.ts",
  "src/lib/server/services/playoffs.test.ts",
  "src/lib/server/services/signup1v1.test.ts",
  "src/lib/server/services/mapBans.test.ts"
)
$mustTest | ForEach-Object { "$_ exists: $(Test-Path $_)" }
# Target: all True

# Count total test cases across the codebase
rg "it\(|test\(" src/ -g "*.test.ts" -c
# Target: > 0 (any tests are better than none). Set a minimum threshold over time.

# Do tests pass?
bun run test
# Target: exit code 0
```

**CI-enforceable:** Yes — `bun run test` in CI once tests exist. Can also enforce "test file must exist for critical services" via a script.

**Note:** Test _quality_ is not deterministically verifiable — "does this test meaningfully cover the failure case?" requires human judgment. But test _existence_ and test _pass/fail_ are fully deterministic.

---

## Gap 10: Load Functions Leak Prisma Internals

**Severity: Medium**

### The Principle

Route `load` functions should map Prisma query results to plain, serializable objects before returning them. This prevents leaking database schema details (relation names, internal IDs, Prisma metadata) to the client, and decouples the API contract from the database schema.

### The Violation

Some load functions carefully map Prisma objects (e.g., `teams/[id]/+page.server.ts` constructs explicit `currentRoster` and `pastRoster` arrays). Others return Prisma results more directly.

This isn't currently measured or enforced. There's no way to know which routes properly shape their data and which pass through raw Prisma objects without reading every load function.

### Why This Matters

If a contributor adds a new route and returns `{ team: await getTeamById(id) }` directly, the client receives the full Prisma object with all relations, internal field names, and potentially sensitive data (like hashed passwords or internal IDs). The client's TypeScript types will be inferred from the Prisma model, coupling the frontend to the database schema.

### Remediation Approach

1. **Document the convention** in a cursor rule (done — see `service-layer-conventions.mdc`).
2. **Audit existing load functions**: Review each load function to verify it returns explicitly shaped objects, not raw Prisma results. This is a read-only audit.
3. **Consider return type annotations**: Adding explicit return types to load functions would catch accidental Prisma leaks at compile time. However, SvelteKit's type inference from `PageServerLoad` makes this optional.
4. **Long-term**: Consider creating DTO (Data Transfer Object) types in `$lib/types/` that load functions must conform to. This creates a compile-time contract.

**Estimated scope**: The audit is a review task. Fixing violations is per-route. Creating DTOs is a larger architectural effort that may not be worth the complexity for a project of this size.

### Deterministic Verification

This is the hardest gap to verify mechanically because "properly shaped data" is semantic, not syntactic. However, partial checks are possible:

```powershell
# Load functions that return a raw service call without reshaping
# Pattern: return { thing: await getSomething() } — returns Prisma object directly
# This is an approximation, not exact, but catches the most common mistake:
rg "return\s*\{[^}]*await\s+\w+\(" src/routes -g "+page.server.ts" --files-with-matches
# Review list manually — not all matches are violations (some services already return plain objects)

# Load functions that import Prisma types (potential sign of leaking Prisma internals to client)
rg "from '\$prisma/client" src/routes -g "+page.server.ts" --files-with-matches
# Not a violation per se (Prisma enums in server files are fine), but worth auditing.
```

**CI-enforceable:** Not reliably. This gap requires human review or explicit return type annotations on load functions. If DTOs are introduced in `$lib/types/`, you could check that load functions reference DTO types.

---

## Gap 11: Audit Logging Coverage Is Incomplete

**Severity: Medium**

### The Principle

Administrative and sensitive actions should be recorded in an audit log for accountability and debugging. The project has a well-designed `logAudit()` function and a comprehensive set of `AuditAction` and `AuditCategory` enums.

### The Violation

Many audit actions are defined in the enum but never actually logged. The `logAudit` function is called extensively in some areas but has gaps in others.

### What IS Audited (well-covered)

| Domain                | Coverage                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Auth                  | Login, logout, Discord link                                                       |
| Admin user management | Role changes, bans, locks, Discord unlink                                         |
| Admin league config   | Season/region/division/arena/format CRUD                                          |
| Admin matches         | Status changes, dispute resolution, score overrides, match creation               |
| Team management       | Team creation, updates, avatar changes, player add/remove/promote/demote, disband |
| Payments              | PayPal capture, manual payment marks                                              |
| Site settings         | All settings, content, API key CRUD                                               |
| Announcements         | CRUD, toggle visibility                                                           |

### What Is NOT Audited (gaps)

| Action                            | Where it happens                      | Risk                                       |
| --------------------------------- | ------------------------------------- | ------------------------------------------ |
| Score submission by team captains | `matches/[id]/+page.server.ts`        | No trail of who submitted what score, when |
| Match dispute creation            | `matches/[id]/+page.server.ts`        | No record of who disputed                  |
| Map ban/pick actions              | `mapBans.ts` service                  | No trail of the ban/pick sequence          |
| Demo upload and reporting         | `demos.ts` service                    | Upload and report events untracked         |
| 1v1 signup withdrawal             | `signup1v1.ts` service                | No record of who withdrew                  |
| PayPal capture failure            | `api/paypal/capture-order/+server.ts` | Failed payments leave no audit trail       |
| Tournament deletion               | `tournaments/+page.server.ts`         | Deletion events untracked                  |
| Team creation via join flow       | `teamJoin.ts` service                 | Indirect team creation not logged          |

### Blast Radius

Low immediate risk, but audit gaps become painful during disputes. If a team claims they submitted a score that was overwritten, or a player claims they never withdrew from 1v1, there's no audit trail to verify. Admin disputes resolution relies on having a clear record of who did what.

### Remediation Approach

1. **Identify which gaps matter**: Score submission and dispute creation are the highest-priority gaps. Map bans matter for competitive integrity. Demo actions and payment failures matter for compliance.
2. **Add `logAudit` calls**: For each gap, add the call in the route action or service function that performs the action. The audit infrastructure already supports all needed categories and actions.
3. **Avoid over-auditing**: Normal user browsing, page loads, and read-only operations should NOT be audited. Only state-changing actions.

**Estimated scope**: ~8 locations need `logAudit` calls added. Each is 5-10 lines.

### Deterministic Verification

```powershell
# Files with form actions (state-changing mutations)
rg "export const actions" src/routes -g "+page.server.ts" --files-with-matches

# Files that call logAudit
rg "logAudit\(" src/routes --files-with-matches

# Diff between these two sets = files with mutations but no audit logging.
# Not all files need auditing (e.g., user self-actions), but the diff is a finite
# review list rather than an open-ended "did the LLM remember?"

# Verify specific known gaps are covered (after remediation):
rg "logAudit\(" src/routes/matches/[id]/+page.server.ts -c        # score submission, disputes
rg "logAudit\(" src/lib/server/services/mapBans.ts -c              # ban/pick actions
rg "logAudit\(" src/routes/api/paypal/capture-order/+server.ts -c  # payment failure
# Target: each > 0
```

**CI-enforceable:** Partially. A script can flag route files that have `export const actions` but no `logAudit` import, producing a review list. Full enforcement requires a defined list of "must-audit" files.

---

## Gap 12: Hardcoded Format IDs in Client Code

**Severity: Low**

### The Principle

Format IDs (`1` for 1v1, `2` for 2v2) should always be referenced via constants (`FORMAT_1V1`, `FORMAT_2V2`) from `$lib/server/constants/formats.ts`. Magic numbers make the code fragile and opaque.

### The Violation

Server-side code consistently uses the constants (20+ files). However, one client-side file hardcodes format IDs:

**File:** `src/routes/admin/teams/+page.svelte`  
**Lines:** 326, 371, 374, 376, 405, 451, 517, 570, 571, 627, 629

All use patterns like `team.formatId === 1` instead of comparing to a constant.

The root cause: `FORMAT_1V1` and `FORMAT_2V2` live in `$lib/server/constants/formats.ts`, which is inside the server boundary. Client components can't import from there.

### Remediation Approach

1. Create `$lib/constants/formats.ts` (not under `server/`) with the same constants.
2. Update the server-side `$lib/server/constants/formats.ts` to re-export from the shared location, or keep both in sync.
3. Update `admin/teams/+page.svelte` to import from `$lib/constants/formats.ts`.
4. Add a CI check or lint rule for hardcoded `formatId === 1` or `formatId === 2` patterns.

**Estimated scope**: 3 files, ~15 minutes. The shared constant file is the key change.

### Deterministic Verification

```powershell
# Hardcoded format ID comparisons in .svelte files
rg "formatId\s*===?\s*[12]\b" src/ -g "*.svelte" -c
# Target: 0

# Hardcoded format ID assignments in .ts files
rg "formatId\s*[:=]\s*[12]\b" src/lib/server/services src/routes -g "*.ts" -c
# Target: 0

# Verify the shared constants file exists (not under server/)
Test-Path src/lib/constants/formats.ts
# Target: True

# Verify .svelte files import from the shared location (not $lib/server/constants)
rg "from '\$lib/server/constants" src/ -g "*.svelte" --files-with-matches
# Target: 0 files
```

**CI-enforceable:** Yes — already partially in CI as a warning. Upgrade to a hard fail after the shared constants file is created.

---

## Gap 13: No Contributor Onboarding Documentation

**Severity: High**

### The Principle

A new contributor (human or LLM) should be able to understand the project's architecture, conventions, and constraints without reading every file. This requires explicit documentation beyond what cursor rules provide (since cursor rules are only visible in Cursor IDE).

### The Violation

- No `CONTRIBUTING.md`
- No `AGENTS.md` (for LLM-specific instructions)
- No Architecture Decision Records (ADRs)
- A `CLAUDE.md` was created as part of this audit but has not been reviewed for accuracy
- The existing `docs/open-source-readiness-analysis.md` covers security and open-source infrastructure but not architectural conventions
- The README covers setup and scripts but not design principles

### Why This Matters

Cursor rules only work inside Cursor. A contributor using VS Code, Neovim, or GitHub's web editor won't see any of the 13 cursor rules. An LLM accessed via API (not through Cursor) won't see them either. GitHub Copilot, which many contributors use, has no awareness of `.cursor/rules/` files.

### Remediation Approach

1. **Review and finalize `CLAUDE.md`**: This was created during the audit and covers the architectural overview. Review it for accuracy and completeness. `CLAUDE.md` is recognized by Claude (Cursor, API, Claude Code) and can also be read by any contributor.
2. **Create `CONTRIBUTING.md`**: Cover setup, code style, PR process, and the key architectural rules (service layer, auth pattern, Zod validation). Link to the cursor rules for Cursor users.
3. **Consider `AGENTS.md`**: GitHub Copilot recognizes this file. It can duplicate the key rules from `CLAUDE.md` in a Copilot-friendly format.
4. **Consider ADRs**: For major decisions (Bun over npm, Svelte 5 runes over stores, service layer over direct DB access, Zod over other validators), brief ADR files in `docs/adr/` capture the "why" that code alone can't convey.

**Estimated scope**: `CONTRIBUTING.md` is ~1 hour. ADRs are ~30 minutes each. `AGENTS.md` can be derived from `CLAUDE.md`.

### Deterministic Verification

```powershell
# Required documentation files exist
Test-Path CLAUDE.md
Test-Path CONTRIBUTING.md
# Target: both True

# Optional but recommended
Test-Path AGENTS.md
# Target: True (for GitHub Copilot users)

# CLAUDE.md covers the key architectural sections
rg "Service Layer|Auth|Form Actions|Validation|Environment Variables" CLAUDE.md -c
# Target: > 0 for each key topic (document isn't empty boilerplate)

# CONTRIBUTING.md covers setup and conventions
rg "bun install|bun run dev|service|Zod|Prisma" CONTRIBUTING.md -c
# Target: > 0 (document covers practical setup and conventions)
```

**CI-enforceable:** Partially — can check file existence. Content quality requires human review.

---

## Priority Matrix

Ordered by a combination of likelihood of violation, severity of consequence, and effort to fix.

| Priority    | Gap                                                                                        | Severity | Effort | Why This Order                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**      | [Gap 8: No CI/CD](#gap-8-no-cicd-pipeline)                                                 | Critical | Low    | Foundation for everything else. Without CI, no other guardrail is enforced automatically.                                                                                                                                        |
| **P0**      | [Gap 7: No Formatting](#gap-7-no-formatting-or-linting-enforcement)                        | High     | Low    | Run Prettier once, enable in CI. Removes formatting noise from all future diffs.                                                                                                                                                 |
| **P-final** | [Gap 13: No Onboarding Docs](#gap-13-no-contributor-onboarding-documentation)              | High     | Medium | Done last — `CONTRIBUTING.md` should describe the _stable_ final codebase, not an intermediate state. Execute in Phase 12 alongside security fixes and open-source infrastructure from `docs/open-source-readiness-analysis.md`. |
| **P1**      | [Gap 5: Client/Server Boundary](#gap-5-client-code-imports-from-server-boundary)           | High     | Low    | One fix + one CI check. Small effort, prevents a class of errors.                                                                                                                                                                |
| **P1**      | [Gap 12: Client Format Constants](#gap-12-hardcoded-format-ids-in-client-code)             | Low      | Low    | 3-file fix. Small but establishes the shared constants pattern.                                                                                                                                                                  |
| **P2**      | [Gap 4: Env Vars Fragmented](#gap-4-environment-variable-access-is-fragmented)             | High     | Medium | Consolidation prevents runtime failures. Call `validateEnvironment()` first (1 line), then migrate callers.                                                                                                                      |
| **P2**      | [Gap 3: Services Coupled to error()](#gap-3-services-coupled-to-sveltekits-error-function) | High     | Medium | 11 services, ~100 replacements. Mechanical but large. Do per-service.                                                                                                                                                            |
| **P2**      | [Gap 2: Inconsistent Error Shapes](#gap-2-inconsistent-form-error-response-shapes)         | Critical | Medium | Decide the canonical shape first, then migrate. Depends on whether you standardize on Shape A or B.                                                                                                                              |
| **P3**      | [Gap 1: Missing Zod Validation](#gap-1-form-actions-bypass-zod-validation)                 | Critical | High   | 17 files, 40+ actions. Largest migration. Do per-domain in batches. Highest impact on input safety.                                                                                                                              |
| **P3**      | [Gap 6: Catch Block Typing](#gap-6-catch-blocks-never-use-unknown-typing)                  | Medium   | High   | ~90 catch blocks. Can be done incrementally alongside other changes.                                                                                                                                                             |
| **P3**      | [Gap 9: No Tests](#gap-9-no-test-infrastructure)                                           | Critical | High   | Setup is fast. Writing meaningful tests is days of work. Start with permissions and payments.                                                                                                                                    |
| **P4**      | [Gap 11: Audit Logging Gaps](#gap-11-audit-logging-coverage-is-incomplete)                 | Medium   | Low    | 8 locations, 5-10 lines each. Do when touching those files.                                                                                                                                                                      |
| **P4**      | [Gap 10: Load Function Leaks](#gap-10-load-functions-leak-prisma-internals)                | Medium   | Medium | Audit-then-fix. Lower urgency since most routes already shape their data.                                                                                                                                                        |

---

## Execution Order: Coordinating with Active Proposals

This gap analysis does not exist in isolation. Three other proposals are in play: **Tournament Unification** (High priority), **UI Component Centralization** (Medium priority), and **Format System** (parked under YAGNI). Executing gap fixes without considering these proposals risks double work — fixing code that a proposal is about to rewrite.

### Dependency Analysis

The three proposals are independent of each other — they touch different parts of the stack. But the architectural gaps sit _underneath_ all of them:

- **Format System** is explicitly parked. The only relevant action items (shared client constants, admin CRUD note) are covered by Gap 12 in this document. No execution needed unless a third format is planned.
- **Tournament Unification** will rewrite `tournaments.ts`, `/tournaments` routes, and player profile tournament sections. Gap fixes applied to those files before the rewrite are wasted effort. This proposal now has a prerequisite: the **Bracket Rendering** proposal (`docs/proposals/bracket-rendering.md`), which designs the UI components and services that consume the unified schema. All tournament data is historical — there are no active events, and actual bracket data lives on external services (BracketHQ, Challonge) that will be imported once.
- **UI Component Centralization** creates Button, Card, Badge components and design tokens. Tournament unification will produce new pages — those pages should be written _with_ the new components, not with inline Tailwind that gets migrated later.

### Ordering Constraints

1. **UI tokens/components before tournament unification.** If you build tournament UI before shared components exist, you write it with inline styles, then rewrite it during UI migration. Building components first means you write tournament UI only once.
2. **Bracket rendering before tournament data migration.** The bracket renderer validates the unified schema against real rendering needs. Migrating data into a schema that the renderer can't consume means rework. Design and build the bracket components first (Phase 4a), then migrate data and wire it up (Phase 4b).
3. **Don't fully remediate gaps in code that a proposal will rewrite.** Specifically: don't apply Zod migration (Gap 1), error shape standardization (Gap 2), or service error decoupling (Gap 3) to `tournaments.ts` or its routes — those files are about to be replaced.
4. **CI and formatting before everything.** Every subsequent change benefits from automated checking.
5. **Onboarding docs are last, not first.** The codebase won't be open to contributors until the gaps are closed. `CONTRIBUTING.md` and contributor-facing docs should reflect the _final_ stable state of the codebase, not an intermediate one. Write them after the structural work is done.

### Recommended Execution Order

Each phase is scoped so an LLM or developer can focus on a single coherent concern per session. Phases that were bundled together in earlier versions of this plan have been split to avoid context-switching between unrelated work.

| Phase    | Work                                                                                                                                                                                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** ✓  | **CI pipeline + Prettier** (Gaps 7, 8)                                                                                                                                                                                                                                                                                                                                                              | Done. Foundation for all subsequent automated checks.                                                                                                                                               |
| **2** ✓  | **Client/server boundary + format constants** (Gaps 5, 12). `AGENTS.md` preamble updated for AI accuracy.                                                                                                                                                                                                                                                                                           | Done. Immediate code correctness fixes.                                                                                                                                                             |
| **3** ✓  | **UI Component Centralization Phase 1+2**: Design tokens in `app.css` + build Button/Card/Badge components. Do NOT migrate existing pages yet.                                                                                                                                                                                                                                                      | Done. Creates the component vocabulary. Existing pages keep working unchanged.                                                                                                                      |
| **4a** ✓ | **Bracket Rendering Design + Build**: Create [`docs/proposals/bracket-rendering.md`](proposals/bracket-rendering.md), then plan and implement bracket UI components and services using Cursor Plan mode. Test and iterate until rendering is solid.                                                                                                                                                 | Done. Dependency for 4b. The bracket renderer validates the unified schema against real rendering needs before data is migrated into it. Build first, wire to live data later.                      |
| **4b** ✓ | **Tournament Unification**: Schema migration, external bracket data import (one-time historical from BracketHQ/Challonge), internal data migration, service rewrite, new UI built using Phase 3 components and Phase 4a bracket renderer. Incremental execution.                                                                                                                                    | Done. 16 events, 446 matches, 898 match players, 458 games live in unified tables. Legacy tables dropped. `tournaments.ts` and `championships.ts` deleted. User profile and demo services migrated. |
| **5** ✓  | **UI Component Centralization Phase 3+4**: Migrate remaining pages to tokens + components (Button, Card, Badge). Push adoption of existing under-used components (FormInput, FormSelect, ConfirmDialog) to replace raw `<input>`, `<select>`, and hand-rolled confirm flows. Skip tournament pages (already new). Delete FormDialog. Fix Toast/hex inconsistencies.                                 | Done. All route pages use shared components and semantic tokens. `audit-ui-tokens.ps1` verification gate ported to cross-platform `scripts/boundary-check.ts`.                                      |
| **6** ✓  | **Env var consolidation** (Gap 4): Call `validateEnvironment()` at startup, migrate `process.env` callers to `getRequiredEnv()` / `$env/dynamic/private`.                                                                                                                                                                                                                                           | Done. `validateEnvironment()` called in `hooks.server.ts`. All `process.env` usage consolidated to `db.ts` and `env.ts`. CI guardrail added.                                                        |
| **7** ✓  | **Error handling overhaul** (Gaps 2, 3): Standardized on Shape A (`fail(status, { error })`). Decoupled 13 services from SvelteKit's `error()` → `notFound()` / `badRequest()` / `forbidden()` / `internalError()`. Refactored `formError()` / `validationError()` helpers to produce unified shape. CI guardrails added.                                                                           | Done. Zero `@sveltejs/kit` imports in services. Unified error shape across all form actions.                                                                                                        |
| **8** ✓  | **Zod validation migration** (Gap 1): Migrated 21 route files / 90+ form actions from manual `formData.get()` to `validateForm()` + Zod schemas. Extended `validateForm` with `arrayKeys` parameter for `getAll()` fields. CI guardrail added for `formData.get()` type assertions.                                                                                                                 | Done. Zero `formData.get(...) as` patterns remain. All form input validated through Zod schemas. Dynamic indexed fields (match scores) use per-entry `safeParse()`.                                 |
| **9** ✓  | **Catch block typing** (Gap 6): Removed all 48 explicit `catch (err: any)` annotations across 14 files. Created `getErrorMessage(err, fallback)` helper in `errors.ts` for safe `HttpError`/`Error` message extraction. Replaced `err.status === 303` redirect checks with `isRedirect()`. 111 untyped catches left as-is — `strict: true` already treats them as `unknown`. CI guardrail added.    | Done. Zero `catch (err: any)` patterns remain. Untyped catches are safe via `useUnknownInCatchVariables` (implied by `strict: true`).                                                               |
| **10**   | **Test infrastructure** (Gap 9): Set up Vitest, write priority tests for permissions, payments, and roster management.                                                                                                                                                                                                                                                                              | Major undertaking on its own. Tests should cover the final code, not intermediate states.                                                                                                           |
| **11**   | **Audit logging + load function audit** (Gaps 10, 11): Add `logAudit` to 8 untracked admin actions. Verify all load functions shape data properly.                                                                                                                                                                                                                                                  | Do opportunistically when touching those files, or as a dedicated cleanup pass.                                                                                                                     |
| **12** ✓ | **Open source prep** (Gap 13 + [`docs/open-source-readiness-analysis.md`](open-source-readiness-analysis.md)): Fix security issues (open redirect, plaintext password fallback, apply rate limiters). Add `LICENSE` (AGPL-3.0), `.env.example`, issue/PR templates. Finalize `CONTRIBUTING.md`. Clean up internal file paths in docs. Move system Steam ID to env var. Remove `AGENTS.md` preamble. | Done. Readiness analysis retained as a historical checklist. Residual cleanup (tests, `any` tightening) tracked separately.                                                                         |

### What Goes Obsolete

- **This entire document** is deleted in Phase 12 once all gaps are closed. It is a temporary remediation tracker, not a permanent architectural reference.
- **This document's affected file counts** (Gaps 1, 2, 3) will shrink by a few files after tournament unification rewrites `tournaments.ts` and its routes. Update the tables after Phase 4b.
- **UI Component Centralization Phase 3 page list** will shrink by 1-2 pages after tournament unification replaces the old tournament UI. Minor update needed.
- **`docs/open-source-readiness-analysis.md`** was consumed in Phase 12 and is retained as a historical checklist (banner at top of that file).
- **Format System**, **Tournament Unification**, and **Bracket Rendering** proposals themselves will not go obsolete from any gap remediation.
- The **Companion Cursor Rules** below remain valid throughout — they describe the target state regardless of execution order.

---

## Companion Cursor Rules

The following cursor rules were created as part of the initial audit. **These should be revisited** after reviewing this document and deciding which gaps to address first. Some rules describe the target state rather than the current state — they're aspirational and will be violated by existing code until the corresponding gap is remediated.

| Rule File                         | Addresses Gap(s) | Status                                                                                                                                      |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-enforcement-pattern.mdc`    | Auth enforcement | Matches current reality — no changes needed                                                                                                 |
| `form-action-patterns.mdc`        | Gaps 1, 2        | **Matches reality** — Phase 8 migrated all form actions to `validateForm()` + Zod schemas. CI enforces no `formData.get()` type assertions. |
| `env-variable-access.mdc`         | Gap 4            | **Matches reality** — Phase 6 consolidated all `process.env` access. CI enforces no raw `process.env` in services/routes.                   |
| `client-server-type-boundary.mdc` | Gap 5, 12        | **Matches reality** — no violations. CI enforces boundary.                                                                                  |
| `service-layer-conventions.mdc`   | Gaps 3, 10       | **Matches reality** — Phase 7 migrated all 13 services to error utilities. CI enforces no `@sveltejs/kit` imports in services.              |
| `audit-logging-policy.mdc`        | Gap 11           | Matches intent. Documents what should be audited.                                                                                           |
| `api-route-conventions.mdc`       | API patterns     | Matches current reality.                                                                                                                    |

**Note:** All architectural guardrails are now enforced by `scripts/boundary-check.ts` (55 checks), runnable locally via `bun run boundary-check` and in CI. All companion cursor rules match current reality.
