# AGENTS.md — Project Architecture Guide

This file is for AI assistants (Claude, Cursor, Copilot) and human contributors. It describes the architectural decisions and conventions for the mge.tf competitive league platform.

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5 (runes only, no legacy stores)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL via Prisma 7 (with `@prisma/adapter-pg` for direct TCP)
- **Styling**: Tailwind CSS 4 via Vite plugin
- **Package Manager**: Bun (never npm/pnpm/yarn)
- **Validation**: Zod
- **Auth**: Steam OpenID + Discord OAuth, HMAC-signed session cookies
- **Deployment**: Docker on Railway, Node adapter

## Architecture

### Layered Server Design

```
Routes (+page.server.ts, +server.ts)    ← Auth checks, input validation, response shaping
    ↓
Services (src/lib/server/services/*.ts)  ← Business logic, all database access
    ↓
Prisma Client (src/lib/server/db.ts)     ← Singleton connection
```

**Rules:**
- Route handlers are thin orchestrators — no Prisma imports
- Services own ALL database queries and business logic
- Services use named exports only (no default exports)
- Services import Prisma from `$lib/server/db`, types from `$prisma/client.js`
- Load functions map Prisma objects to plain serializable shapes before returning

### Client/Server Boundary

- `$lib/server/` is server-only — client code must never import from it (not even `import type`)
- Shared types live in `$lib/types/` (e.g., `SessionUser`, `UserRole`)
- Prisma types stay server-side; mirror needed types in `$lib/types/`
- Client state uses `.svelte.ts` files with `$state` class singletons (see `$lib/state/`)

### Auth

- Session set in `hooks.server.ts` → `event.locals.user`
- Auth guards: `requireAuth()`, `requireAdmin()`, `requireNotBanned()`, `requireTeamAdmin()` from `$lib/server/auth/permissions`
- Admin routes protected at layout level (`/admin/+layout.server.ts`)
- Every protected route/action must call auth guards as its first operation
- `/api/v1/*` uses API key auth; `/api/*` uses session auth

### Mutations

- User-facing mutations use SvelteKit form actions (not API routes)
- All form input validated with Zod schemas via `validateForm()` from `$lib/server/utils/forms`
- Error responses use `validationError()` / `formError()` helpers for consistent shapes
- API routes are for SSE, webhooks, and external integrations only

### Error Handling

- Services throw via `notFound()`, `forbidden()`, `badRequest()` from `$lib/server/utils/errors`
- Route actions return `fail()` via the form helper utilities
- Custom `AppError` subclasses available for structured errors

### Environment Variables

- Security secrets: `getRequiredEnv()` from `$lib/server/utils/env`
- Service credentials: `$env/dynamic/private` or named getters in `env.ts`
- Raw `process.env` only in `db.ts` for `DATABASE_URL`

### Constants

- Format IDs: `FORMAT_1V1`, `FORMAT_2V2` from `$lib/server/constants/formats` — never hardcode `1` or `2`

## Commands

```bash
bun run dev          # Development server
bun run build        # Production build (runs prisma generate first)
bun run check        # Type checking (svelte-check)
bun run generate     # Regenerate Prisma client
bun run migrate      # Run migrations (dev)
bun run migrate:prod # Run migrations (production)
```

## File Organization

```
src/
├── lib/
│   ├── components/     # Svelte components (charts/, icons/, layout/, markdown/, ui/)
│   ├── server/
│   │   ├── auth/       # Auth helpers (steam, discord, permissions, apiKey)
│   │   ├── constants/  # Shared constants (format IDs)
│   │   ├── services/   # Business logic (one file per domain)
│   │   ├── utils/      # Error handling, validation, forms, sanitization, logging
│   │   ├── db.ts       # Prisma singleton
│   │   └── session.ts  # Session cookie management
│   ├── state/          # Client-side reactive state (.svelte.ts singletons)
│   ├── types/          # Shared types (client + server safe)
│   └── utils/          # Client-safe utilities
├── routes/
│   ├── admin/          # Admin panel (layout-level auth)
│   ├── api/            # API endpoints (SSE, webhooks, external)
│   ├── auth/           # Login/logout/verify flows
│   └── ...             # Feature routes
└── hooks.server.ts     # Session, security headers, staging gate
```
