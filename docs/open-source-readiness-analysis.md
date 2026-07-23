# Open-Source Readiness Analysis: website-next (mge.tf)

> **Historical document (March 2, 2026).** Kept for audit trail. Do not treat checklists below as current work.
>
> **Status as of July 2026:** Phase 1 and Phase 2 items are largely complete (AGPL-3.0 `LICENSE`, `CONTRIBUTING.md`, `.env.example`, GitHub issue/PR templates, CI, open-redirect fix, plaintext password fallback removed, rate limiters wired, Discord OAuth CSRF hardened, API key masking, and related hardening). Remaining follow-ups live in contributor docs (`CONTRIBUTING.md`, `AGENTS.md`) and any open pre-release batches (tests, low-priority cleanup). Prefer those over this file.

**Date:** March 2, 2026
**Repository:** `mgetf/website-next`
**Commits:** 128 (single primary contributor + 1 external)
**Stack:** SvelteKit 2 / Svelte 5, PostgreSQL, Prisma 7, Tailwind CSS 4

---

## Executive Summary

The `website-next` repository is **close to being open-sourceable but not yet ready**. No hardcoded secrets exist in the codebase or git history, and the architecture is sound. However, there are several security vulnerabilities that would become exploitable once the code is public, missing foundational open-source infrastructure (license, contributing guidelines, `.env.example`), and code quality issues that would impact community perception. This document provides a full breakdown and a prioritized action plan.

---

## Table of Contents

1. [Security Assessment](#1-security-assessment)
2. [Secrets & Sensitive Data](#2-secrets--sensitive-data)
3. [Code Quality & Architecture](#3-code-quality--architecture)
4. [Open-Source Infrastructure](#4-open-source-infrastructure)
5. [Strategic Considerations for mge.tf](#5-strategic-considerations-for-mgetf)
6. [Pros of Open-Sourcing](#6-pros-of-open-sourcing)
7. [Cons of Open-Sourcing](#7-cons-of-open-sourcing)
8. [Prioritized Action Plan](#8-prioritized-action-plan)
9. [Final Recommendation](#9-final-recommendation)

---

## 1. Security Assessment

### 1.1 Critical: Open Redirect After Login

**File:** `src/routes/auth/login/+server.ts`

The `redirect` query parameter is accepted from the URL and stored as-is in a cookie. After Steam authentication completes, the user is redirected to that URL without validation. An attacker could craft a link like:

```
https://mge.tf/auth/login?redirect=https://evil-phishing-site.com
```

This is a well-known vulnerability class. With the code public, anyone can see this pattern and exploit it immediately.

**Required fix:** Validate that redirect URLs are relative paths or same-origin before storing them.

### 1.2 Critical: Plaintext Password Fallback

**File:** `src/lib/server/utils/password.ts` (lines 58-62)

The `verifyPassword` function has a backwards-compatibility fallback: if the stored hash doesn't match the expected `salt:hash` format, it falls back to **plaintext string comparison**. With the source code public, attackers know that some team passwords may be stored in plaintext and can target those specifically.

**Required fix:** Remove the plaintext fallback. If legacy plaintext passwords still exist in the database, force-migrate them (hash all plaintext passwords in a one-time script) before open-sourcing.

### 1.3 High: Rate Limiting Implemented but Not Applied

**File:** `src/lib/server/utils/rateLimit.ts`

Five rate limiters are defined (`authRateLimiter`, `paymentRateLimiter`, `passwordRateLimiter`, `apiRateLimiter`, `adminRateLimiter`) but **none of them are actually used in any route**. This means:

- Auth endpoints have no brute-force protection
- Payment endpoints have no abuse protection
- Password attempts (team join) have no throttling
- API endpoints have no DDoS mitigation

With the code public, attackers can see there is no rate limiting and exploit it freely.

**Required fix:** Apply rate limiters to auth routes (`/auth/*`), payment routes (`/api/paypal/*`), team join password verification, and general API endpoints.

### 1.4 Medium: X-Forwarded-For Spoofing

**File:** `src/lib/server/utils/rateLimit.ts` (lines 172-177)

`getClientIp()` trusts the `X-Forwarded-For` header unconditionally. If the application is ever exposed directly (not behind a reverse proxy), clients can spoof their IP to bypass rate limiting entirely.

**Required fix:** Document the requirement for a trusted reverse proxy, or only trust `X-Forwarded-For` when a configuration flag confirms the app is behind one.

### 1.5 Medium: Console Logging of Sensitive Config

**File:** `src/lib/server/auth/discord.ts`

The Discord OAuth redirect URI is logged to the console during every OAuth flow. While not a direct vulnerability, it leaks deployment configuration into server logs.

**Required fix:** Remove or gate behind a `dev`-only condition.

### 1.6 Low: CSP Uses `unsafe-inline`

**File:** `src/hooks.server.ts`

Both `script-src` and `style-src` CSP directives include `'unsafe-inline'`. This weakens XSS protection. While somewhat standard for SvelteKit apps using Tailwind, it's worth documenting and ideally migrating to nonce-based CSP.

### 1.7 Low: `validateEnvironment()` Never Called

**File:** `src/lib/server/utils/env.ts`

A function exists to validate all required environment variables at startup, but it's never invoked. This means the app can start with missing configuration and fail at runtime with cryptic errors.

**Required fix:** Call `validateEnvironment()` in `hooks.server.ts` or the app entry point.

---

## 2. Secrets & Sensitive Data

### 2.1 Current Code — Clean

No hardcoded API keys, tokens, passwords, or credentials were found anywhere in the codebase. All sensitive values are loaded from environment variables via `process.env` or `$env/dynamic/private`.

### 2.2 Git History — Clean

No `.env` files were ever committed to the repository. A search for common secret patterns (`sk-`, `AKIA`, API keys) in the git history returned no results. The repository has 128 commits from a single primary contributor, which limits the risk surface.

### 2.3 Hardcoded Steam IDs

A system user Steam ID (`76561199005229176`) is hardcoded in `src/lib/server/services/adminMatches.ts` for match comm ownership. This is low risk but could identify a specific Steam account as the system/bot account.

**Recommendation:** Move to an environment variable (`SYSTEM_USER_STEAM_ID`).

### 2.4 Internal File Paths in Documentation

`docs/production-migration.md` contains Windows-specific local paths (`C:\Users\Maxi\Documents\...`). This is not a security risk but looks unprofessional for an open-source project and reveals the developer's local environment.

**Recommendation:** Replace with generic relative paths or documented variables.

### 2.5 Environment Variable Handling

| Category  | Variables                                                                 | Handling                                        |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Database  | `DATABASE_URL`                                                            | `process.env` in `db.ts`                        |
| Auth      | `STEAM_API_KEY`, `SESSION_SECRET`, `JWT_SECRET`                           | Mix of `process.env` and `$env/dynamic/private` |
| Discord   | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`      | `$env/dynamic/private`                          |
| Payments  | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`                 | `process.env`                                   |
| Storage   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`, etc. | `process.env`                                   |
| Analytics | `POSTHOG_API_KEY`, `POSTHOG_HOST`                                         | Not verified                                    |
| App       | `APP_ENVIRONMENT`, `PUBLIC_URL`, `PORT`, `HOST`                           | `process.env`                                   |

**Issue:** There is inconsistency between `env.ts` (which validates `R2_*` variable names) and `r2Upload.ts` (which uses `S3_*` variable names). Should be unified before open-sourcing.

---

## 3. Code Quality & Architecture

### 3.1 Architecture — Good

The project follows a clear, well-organized architecture:

- **Service layer pattern:** Database operations are abstracted into `src/lib/server/services/*.ts` files (25+ service files covering teams, matches, seasons, tournaments, payments, etc.)
- **Route organization:** Clean SvelteKit route structure with admin, API, auth, and public routes well-separated
- **Component organization:** UI components are logically grouped (`layout/`, `ui/`, `ui/form/`, `charts/`, `markdown/`)
- **State management:** Uses Svelte 5 runes with `.svelte.ts` state files (modern pattern)
- **Utility layer:** Shared utilities for forms, validation, errors, logging, sanitization

### 3.2 Architecture — Issues

- **Rule violations:** ~10 route files contain direct Prisma access instead of going through services (violating the project's own cursor rule). Notable offenders: `auth/discord/callback`, `auth/verify`, `teams/[id]/edit`, `api/paypal/capture-order`
- **Inconsistent error handling:** Three different error patterns coexist: `throw error()`, `return fail()`, and `return json({ error })`. Custom error classes in `errors.ts` are defined but never used
- **Form validation inconsistency:** `handleFormAction` and Zod schemas exist in utilities but most actions use manual `formData.get()` with ad-hoc validation
- **Unused utilities:** `errors.ts` exports `AppError`, `ValidationError`, `NotFoundError`, `AuthorizationError` — none are used anywhere

### 3.3 Type Safety — Mixed

- TypeScript strict mode is enabled (good)
- Widespread use of `any` in Svelte components, especially admin pages (`league`, `matches`, `site`, `users`)
- `catch (err: any)` used instead of `catch (err: unknown)` throughout
- Some SvelteKit-specific misuses (`err.body?.message` where redirects use `status`)

### 3.4 Testing — Absent

- **Zero test files** in the entire repository
- No test runner (Vitest, Jest, etc.) in dependencies
- No test scripts in `package.json`
- No CI/CD pipeline to run tests

This is the single biggest code quality concern for an open-source project.

### 3.5 Linting — Minimal

- No ESLint configuration
- No Prettier configuration
- Only `svelte-check` for type checking
- No automated formatting or linting enforcement

### 3.6 Documentation — Partial

- **README:** Good. Covers setup, project structure, scripts, deployment, and features
- **JSDoc:** Present in server utilities and some services; absent in most components and routes
- **Proposals/RFCs:** 4 internal proposal documents exist in `docs/proposals/` (tournament unification, format system, schema normalization, 1v1 leagues) — shows good planning discipline
- **Missing:** No API documentation, no architecture decision records, no contributing guide

### 3.7 TODOs and Technical Debt

| File             | TODO                                                          |
| ---------------- | ------------------------------------------------------------- |
| `password.ts`    | Remove plaintext password fallback after migration            |
| `seasons.ts`     | Temporary workaround for region info in filters               |
| `tournaments.ts` | Prize pool hardcoded as `$250` instead of from database       |
| `tournaments.ts` | Fix schema for single source of truth across tournament types |
| `mapBans.ts`     | Notify opposing team of ban/pick action                       |
| `matchComms.ts`  | Create notifications for team owners/admins                   |
| `matchComms.ts`  | Notify relevant parties of reschedule response                |

### 3.8 Dependencies — Modern and Reasonable

The dependency list is lean and uses current versions:

- SvelteKit 2.53, Svelte 5.53, Vite 7.3
- Prisma 7.4 (latest)
- Tailwind CSS 4.2
- Zod 4.3 for validation
- No outdated or abandoned dependencies detected
- No known vulnerabilities in the dependency tree (based on current versions)

---

## 4. Open-Source Infrastructure

### 4.1 Missing: License

No `LICENSE` file exists. **This is the single most important missing piece.** Without a license, the code is technically "all rights reserved" — no one can legally fork, modify, or contribute to it.

**Recommendation:** Choose a license that aligns with mge.tf's goals:

- **MIT** or **Apache 2.0**: Maximum community adoption, anyone can use the code (even commercially). Best for growing an ecosystem around mge.tf
- **AGPL-3.0**: Forces anyone who hosts a modified version to share their changes. Protects against someone forking mge.tf and running a competing service without contributing back
- **BSL (Business Source License)**: Source-available but not truly open-source. Prevents commercial competition while allowing community contributions. Used by MariaDB, Sentry, etc.

Given that mge.tf is a community-driven TF2 tournament organization and you want community contributions, **AGPL-3.0** is likely the best fit — it encourages contributions while preventing someone from silently forking and competing.

### 4.2 Missing: `.env.example`

No `.env.example` file exists (though the `.gitignore` explicitly allows one). The README documents the variables, but a `.env.example` is the standard convention and enables `cp .env.example .env` workflows.

### 4.3 Missing: `CONTRIBUTING.md`

No contributing guide exists. For an open-source project, this should cover:

- How to set up the development environment
- Code style expectations
- Pull request process
- Issue reporting guidelines
- Code of conduct

### 4.4 Missing: Issue Templates and PR Templates

No `.github/` directory with issue templates or pull request templates.

### 4.5 Missing: CI/CD Pipeline

No GitHub Actions workflows exist. A minimal pipeline should:

- Run `bun run check` (svelte-check) on PRs
- Run tests (once they exist)
- Optionally run linting

### 4.6 Present: Docker Support

`Dockerfile` and `docker-compose.yml` are present and well-configured. Good for contributors who want to run the full stack.

### 4.7 Present: README

The README is comprehensive and covers prerequisites, setup, project structure, scripts, database info, deployment, and features. It's a solid foundation.

### 4.8 `package.json` — Private Flag

`"private": true` is set, which is fine for an application (not a library). No issues here.

---

## 5. Strategic Considerations for mge.tf

### 5.1 Comparison to RGL

RGL (RGL.gg) is the largest competitive TF2 league in North America. Their website is closed-source. By open-sourcing, mge.tf would differentiate itself as the **transparent, community-driven alternative**. This is strategically powerful in the TF2 community, which values openness and community involvement.

### 5.2 Community Trust

The TF2 competitive community is tight-knit and technically literate. Many players are developers. Open-sourcing the platform:

- Builds trust that the platform handles data fairly
- Enables community members to verify security claims
- Creates ownership ("our platform" vs "their platform")

### 5.3 Sustainability Risk

As a growing tournament org, mge.tf may eventually handle:

- Player payment information (via PayPal — already implemented)
- Anti-cheat integrations
- Prize pool management
- Partnership/sponsorship data

Open-sourcing means every security measure, business logic, and operational detail is visible. This is a double-edged sword: it forces good security practices, but it also means attackers have a complete blueprint.

### 5.4 Competitive Advantage

The code itself is not the competitive advantage — the community, the tournament operations, the reputation, and the administrative team are. The code is a commodity. Open-sourcing it costs very little competitively while gaining significant community goodwill.

### 5.5 Contribution Potential

With 128 commits from 1 primary developer, the bus factor is 1. Open-sourcing can:

- Attract contributors for bug fixes and features
- Distribute maintenance burden
- Accelerate development of features (map bans, notifications, etc.) that currently have TODOs

However, open-source contributions don't happen automatically. Active community management, good documentation, and "good first issue" labels are needed to attract contributors.

---

## 6. Pros of Open-Sourcing

| #   | Pro                                                                                                                                                                    | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Community trust and transparency** — Players can see exactly how their data is handled, how matches are managed, and how admin decisions are processed               | High   |
| 2   | **Community contributions** — The TF2 community is technically skilled; contributors can fix bugs, add features, and improve the platform faster than a solo developer | High   |
| 3   | **Reduced bus factor** — Currently at 1. Open-sourcing enables others to understand and maintain the codebase if the primary developer becomes unavailable             | High   |
| 4   | **Security through transparency** — Forces good security practices. Community members can audit the code and report vulnerabilities responsibly                        | Medium |
| 5   | **Recruitment** — Contributors become invested in the platform and may take on leadership roles in mge.tf's operations                                                 | Medium |
| 6   | **Differentiation from RGL** — Being open-source is a unique selling point in the TF2 competitive scene. No major TF2 league is open-source                            | Medium |
| 7   | **Portfolio value** — A well-maintained open-source tournament platform is valuable for all contributors' portfolios                                                   | Low    |
| 8   | **Ecosystem growth** — Other communities (not just TF2) could fork and adapt the platform for their own tournaments, growing the ecosystem                             | Low    |
| 9   | **Free infrastructure** — GitHub Actions, community issue triage, documentation contributions are effectively free labor                                               | Low    |

---

## 7. Cons of Open-Sourcing

| #   | Con                                                                                                                                                                                      | Impact   | Mitigation                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 1   | **Security vulnerabilities exposed** — The open redirect, missing rate limiting, and plaintext password fallback become immediately exploitable                                          | Critical | Fix all critical issues before open-sourcing                                                            |
| 2   | **Maintenance burden** — Issues, PRs, and community management require ongoing effort from maintainers                                                                                   | Medium   | Start with a small scope; use "good first issue" labels; set expectations in CONTRIBUTING.md            |
| 3   | **No tests** — Contributors can introduce regressions without any safety net; the lack of tests also signals low code maturity to potential contributors                                 | Medium   | Add at least basic integration tests for critical paths (auth, payments, match reporting) before launch |
| 4   | **Code quality perception** — Widespread `any` usage, inconsistent patterns, and unused utilities may deter experienced contributors                                                     | Medium   | Clean up the most visible issues; document the architectural vision                                     |
| 5   | **Operational details visible** — Admin logic, payment flows, ban systems, and dispute resolution mechanisms are fully transparent. Malicious users could study these to game the system | Medium   | Accept this as a trade-off; design systems to be secure even when logic is known                        |
| 6   | **Forking risk** — Someone could fork mge.tf and run a competing tournament platform                                                                                                     | Low      | Use AGPL-3.0 to require forks to share changes; the real value is the community, not the code           |
| 7   | **Internal documentation exposed** — Migration docs contain local paths; proposal docs reveal internal planning                                                                          | Low      | Clean up internal docs; move truly private planning to a separate location                              |
| 8   | **Hardcoded system Steam ID exposed** — The system user account becomes known                                                                                                            | Low      | Move to environment variable                                                                            |

---

## 8. Prioritized Action Plan

### Phase 1: Must-Do Before Open-Sourcing (Critical)

- [x] **Fix open redirect vulnerability** — Validate redirect URLs in auth flow
- [x] **Remove plaintext password fallback** — Migrate any remaining plaintext passwords, then remove the fallback code
- [x] **Apply rate limiting** — Wire up the existing rate limiters to auth, payment, and API routes
- [x] **Add LICENSE file** — Choose and add a license (recommend AGPL-3.0)
- [x] **Create `.env.example`** — Document all required and optional environment variables with placeholder values
- [x] **Remove internal file paths** — Clean up `docs/production-migration.md` and other docs that reference `C:\Users\Maxi\...`
- [x] **Move system Steam ID to env var** — Replace hardcoded `76561199005229176` with `SYSTEM_USER_STEAM_ID`

### Phase 2: Should-Do Before Open-Sourcing (Important)

- [x] **Add CONTRIBUTING.md** — Setup instructions, code style, PR process, code of conduct
- [x] **Add GitHub issue/PR templates** — Bug report, feature request, PR template
- [x] **Call `validateEnvironment()` at startup** — Fail fast with clear errors
- [x] **Add basic CI pipeline** — GitHub Actions for `bun run check` on PRs
- [x] **Remove console.log of Discord redirect URI** — In `discord.ts`
- [x] **Unify env var naming** — R2 vs S3 variable name inconsistency
- [x] **Clean up `any` types in critical paths** — At minimum, admin and auth routes

### Phase 3: Nice-to-Have (Post-Launch)

- [ ] **Add Vitest and basic tests** — Auth flow, service layer, form validation
- [ ] **Add ESLint + Prettier** — Enforce consistent code style
- [ ] **Move Prisma access out of routes** — Fix the ~10 route files that violate the service layer pattern
- [ ] **Adopt `handleFormAction` consistently** — Standardize form handling
- [ ] **Adopt custom error classes** — Use the defined `AppError`, `ValidationError`, etc.
- [ ] **Add API documentation** — Document the API endpoints for third-party integrations
- [ ] **Add "good first issue" labels** — Tag issues appropriate for new contributors

---

## 9. Final Recommendation

**Open-source the repository after completing Phase 1 and at least the first three items of Phase 2.**

The codebase is architecturally sound, uses modern technologies, and handles secrets properly. The main blockers are the three security vulnerabilities (open redirect, plaintext password fallback, unapplied rate limiting) and the missing open-source infrastructure (license, `.env.example`, contributing guide).

Phase 1 should take approximately **1-2 days of focused work**. Phase 2 adds another **1-2 days**. This is a modest investment for the significant benefits that open-sourcing provides.

The lack of tests is a concern but not a blocker — many successful open-source projects launched without tests and added them incrementally. Document this as a known limitation in the README and make "add tests" one of the first community-friendly issues.

**Recommended license:** AGPL-3.0. It provides the openness that builds community trust while ensuring that anyone who forks and hosts a modified version must share their changes. This protects mge.tf from silent competitors while welcoming genuine community contributions.

**Timing:** Open-source before the next major season or tournament launch. This maximizes visibility and gives the community a reason to engage with the codebase (upcoming features, season-specific improvements, etc.).

---

_This analysis was conducted by reviewing all 128 commits, the full directory structure, all service files, auth implementation, session management, database schema, Docker configuration, and documentation. No secrets or credentials were found in the current codebase or git history._
