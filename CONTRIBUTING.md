# Contributing to MGE.tf

Thanks for your interest in contributing. This document covers the practical steps for getting set up and submitting changes. For deeper architectural conventions, see [AGENTS.md](AGENTS.md). Cursor IDE users should also check `.cursor/rules/` for enforced patterns.

## Prerequisites

- [Bun](https://bun.sh) (package manager and script runner; never npm/pnpm/yarn)
- PostgreSQL
- A Steam API key (for Steam OpenID auth locally)

## Setup

```bash
bun install
cp .env.example .env      # fill in your local values
bun run generate          # generate the Prisma client
bun run migrate           # run database migrations
bun run dev                # start the dev server
```

## Branching Model

```
feature/* → staging → master
```

- Branch off `staging` for new work, using a `feature/*` branch name.
- Open pull requests against `staging`. `staging` deploys to `dev.mge.tf`.
- `master` is promoted from `staging` and deploys to production (`mge.tf`).
- Never commit directly to `staging` or `master`.

## Required Checks Before Opening a PR

Run all of these and fix any issues before submitting:

```bash
bun run format
bun run check
bun run boundary-check
bun run knip
bun run test
```

- `format` — Prettier formatting
- `check` — TypeScript / Svelte type checking
- `boundary-check` — enforces the architectural boundaries described below
- `knip` — flags unused files, dependencies, and exports
- `test` — Vitest unit tests for pure helpers and critical business logic

## Architecture Must-Knows

- **Service layer for the database**: all Prisma access lives in `src/lib/server/services/<domain>.ts`. Route files (`+page.server.ts`, `+server.ts`) never import Prisma directly.
- **Client/server boundary**: code under `$lib/server/` is server-only. Client code (`.svelte`, `$lib/state/`, `$lib/utils/`, `$lib/components/`) must never import from it, not even with `import type`. Shared types belong in `$lib/types/`.
- **Form actions for mutations**: user-facing mutations are SvelteKit form actions, validated with Zod via `validateForm()` from `$lib/server/utils/forms`. API routes are reserved for SSE, webhooks, and external integrations.
- **Auth guards first**: every protected `load` function and form action must call the appropriate guard (`requireAuth`, `requireAdmin`, `requireNotBanned`, `requireTeamAdmin`, etc.) from `$lib/server/auth/permissions` as its first operation.

See [AGENTS.md](AGENTS.md) for the full architecture guide, including error handling, environment variable access, and file organization conventions.

## Pull Request Expectations

- Keep diffs focused on one change; avoid bundling unrelated refactors.
- Describe _why_ the change is needed, not just what it does.
- Never commit secrets (`.env`, credentials, API keys).
- Make sure the required checks above pass before requesting review.
