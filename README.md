# MGE.tf (website-next)

Complete rewrite of [mge.tf](https://mge.tf) from Express.js/EJS to SvelteKit with Svelte 5.

Licensed under [AGPL-3.0](LICENSE).

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5 (runes)
- **Language**: TypeScript (strict)
- **Database**: PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Styling**: Tailwind CSS 4
- **Package manager**: [Bun](https://bun.sh/) (required; npm/pnpm/yarn are blocked)
- **Validation**: Zod
- **Auth**: Steam OpenID, Discord OAuth
- **Payments**: PayPal and TF2 item payments
- **Storage**: S3-compatible object storage (Cloudflare R2)

## Prerequisites

- [Bun](https://bun.sh/)
- PostgreSQL
- Steam API key (required for local auth)
- Discord OAuth app, PayPal credentials, and R2/S3 credentials (optional)

## Getting Started

### 1. Clone and install

```bash
git clone git@github.com:mgetf/website-next.git
cd website-next
bun install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in at least:

| Variable         | Notes                        |
| ---------------- | ---------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string |
| `STEAM_API_KEY`  | Steam Web API key            |
| `JWT_SECRET`     | 32+ random characters        |
| `SESSION_SECRET` | 32+ random characters        |

Optional variables (`APP_ENVIRONMENT`, Discord, PayPal, R2/S3, `PUBLIC_URL`, `MGE_PANEL_URL`, `MGE_PLATFORM_URL`, `DB_POOL_MAX`, `REALTIME_NOTIFICATIONS_ENABLED`, and others) are documented in [`.env.example`](.env.example).

### 3. Set up the database

```bash
bun run generate   # Prisma client
bun run migrate    # apply migrations (prisma migrate deploy)
```

For creating a new migration during development:

```bash
bun prisma migrate dev --name your_migration_name
```

### 4. Run the development server

```bash
bun run dev
```

The app is available at `http://localhost:5173`.

## Project Structure

```
src/
├── lib/
│   ├── assets/          # Static icons/images
│   ├── components/      # Svelte components (brackets/, charts/, layout/, markdown/, ui/, …)
│   ├── constants/       # Client-safe constants (format IDs, etc.)
│   ├── server/
│   │   ├── auth/        # Steam, Discord, permissions, API keys
│   │   ├── services/    # Business logic and all Prisma access
│   │   ├── utils/       # Errors, forms, validation, rate limits, uploads
│   │   ├── realtime/    # Notification hub (SSE / LISTEN)
│   │   ├── db.ts        # Prisma singleton
│   │   └── session.ts   # Session cookies
│   ├── state/           # Client reactive state (.svelte.ts)
│   ├── types/           # Shared client/server types
│   └── utils/           # Client-safe utilities
├── routes/
│   ├── admin/           # Admin panel (layout-level auth)
│   ├── api/             # SSE, webhooks, client fetch, /api/v1 external API
│   ├── auth/            # Login / logout / Discord / Steam verify
│   ├── leagues/         # 1v1 and 2v2 league pages
│   ├── matches/         # Match pages
│   ├── signup/          # Team / player signup
│   ├── teams/           # Team pages
│   ├── tournaments/     # Unified event/tournament pages
│   ├── users/           # Profiles, notifications, payments
│   └── …                # maps, servers, logs, leaderboard, checkout, …
└── hooks.server.ts      # Session, security headers, staging gate, rate limits
```

Architecture conventions live in [AGENTS.md](AGENTS.md). Contributor setup and PR expectations live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Scripts

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `bun run dev`            | Start development server                        |
| `bun run build`          | Generate Prisma client and build for production |
| `bun run preview`        | Preview production build                        |
| `bun run check`          | TypeScript / Svelte type checking               |
| `bun run format`         | Format with Prettier                            |
| `bun run format:check`   | Check formatting (CI)                           |
| `bun run boundary-check` | Architecture / UI boundary checks (CI)          |
| `bun run knip`           | Unused files, dependencies, and exports (CI)    |
| `bun run generate`       | Generate Prisma client                          |
| `bun run migrate`        | Apply migrations (`prisma migrate deploy`)      |
| `bun run migrate:prod`   | Apply migrations using `.env.production`        |

Before opening a PR, run: `bun run format`, `bun run check`, `bun run boundary-check`, and `bun run knip`.

## Database

Schema: `prisma/schema.prisma`. Important models:

- **User** — Steam-authenticated accounts
- **Team** / **PlayerInTeam** — 2v2 (and 1v1 entry) rosters
- **Match** / **Game** — League matches
- **Season** / **Division** / **Region** — League structure
- **Event** (+ stages, matches, participants, placements) — unified tournaments / fight nights / championships
- **Demo** — Match demo uploads
- **ItemPaymentOrder** — TF2 item payment flow

### Production migrations

Local / one-off:

```bash
bun run migrate
# or against a specific env file:
bun run migrate:prod
```

Docker/Railway production images run `bun run start:prod`, which applies `prisma migrate deploy` automatically before starting the app. Prefer that over running migrate by hand against remote DBs.

Local development still uses `bunx prisma migrate dev` when creating new migrations.

## Deployment

### Docker

```bash
docker build -t mge-next .
docker compose up -d
```

See `docker-compose.yml` for environment variables. Production deploys also set `APP_ENVIRONMENT` (`production` on mge.tf, `staging` on dev.mge.tf).

Optional Railway **Release Command**: `bunx prisma migrate deploy` (safe even if `start:prod` also migrates; Prisma is idempotent).

### Manual

```bash
bun run build
bun run start:prod
```

The Node/Bun adapter listens on `HOST` / `PORT` (defaults: `0.0.0.0:3000`).

## Branching

```
feature/* → staging → master
```

- PRs target `staging` (`dev.mge.tf`)
- `master` is production (`mge.tf`), promoted from `staging`
- Never commit directly to `staging` or `master`

## Key Features

- **2v2 and 1v1 leagues** — Seasons, divisions, regions, standings, playoffs
- **Unified events** — Tournaments, fight nights, and championships on one event schema
- **Team management** — Create/join, invites, roster, passwords
- **Match reporting** — Scores, demos, disputes, reschedules, map bans
- **Payments** — PayPal league fees and TF2 item checkout
- **Admin panel** — Users, teams, matches, maps, tournaments, site CMS, audit logs
- **Notifications** — In-app notifications with optional realtime SSE
- **Maps** — Public map browser and downloads
- **Servers** (`/servers`) — Live public server browser via the mge-servers-panel API (`MGE_PANEL_URL`)
- **Leaderboard** — Platform ratings when `MGE_PLATFORM_URL` is configured

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version:

1. Branch off `staging` as `feature/*`
2. Make your changes and run `bun run format`, `bun run check`, `bun run boundary-check`, `bun run knip`
3. Open a PR against `staging` (never against `master` directly)
