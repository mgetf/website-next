# MGE.tf (website-next)

Complete rewrite of [mge.tf](https://mge.tf) from Express.js/EJS to SvelteKit with Svelte 5.

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5
- **Database**: PostgreSQL with Prisma 7
- **Styling**: Tailwind CSS 4
- **Auth**: Steam OpenID, Discord OAuth
- **Payments**: PayPal
- **Storage**: AWS S3 / Cloudflare R2
- **Analytics**: PostHog

## Prerequisites

- [Bun](https://bun.sh/)
- PostgreSQL database
- Steam API key
- Discord OAuth app (optional)
- PayPal credentials (optional)

## Getting Started

### 1. Clone and install dependencies

```bash
git clone git@github.com:mgetf/website-next.git
cd website-next
bun install
```

### 2. Configure environment variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mge"

# Steam Authentication (required)
STEAM_API_KEY="your-steam-api-key"

# Discord OAuth (optional)
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
DISCORD_REDIRECT_URI="http://localhost:5173/auth/discord/callback"

# PayPal (optional)
PAYPAL_CLIENT_ID=""
PAYPAL_CLIENT_SECRET=""
PAYPAL_MODE="sandbox"

# AWS S3 / R2 for file uploads (optional)
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
AWS_BUCKET_NAME=""

# PostHog Analytics (optional)
POSTHOG_API_KEY=""
POSTHOG_HOST="https://us.i.posthog.com"

# Session
SESSION_SECRET="generate-a-random-32-char-string"
```

### 3. Set up the database

```bash
# Generate Prisma client
bun generate

# Run migrations
bun migrate
```

### 4. Run development server

```bash
bun dev
```

The app will be available at `http://localhost:5173`.

## Project Structure

```
src/
├── lib/
│   ├── assets/          # Static assets (icons, images)
│   ├── components/      # Reusable Svelte components
│   │   ├── charts/      # Chart.js components
│   │   ├── layout/      # Navigation, dropdowns, etc.
│   │   └── markdown/    # Markdown rendering
│   ├── server/
│   │   ├── auth/        # Steam & Discord authentication
│   │   ├── services/    # Business logic (matches, teams, etc.)
│   │   └── utils/       # Helper functions
│   ├── types/           # TypeScript types
│   └── utils/           # Client-side utilities
├── routes/
│   ├── admin/           # Admin panel pages
│   ├── api/             # API endpoints
│   ├── auth/            # Auth routes (login, logout, callbacks)
│   ├── leagues/         # 1v1 and 2v2 league pages
│   ├── matches/         # Match pages
│   ├── signup/          # Team/player signup flows
│   ├── teams/           # Team pages
│   ├── tournaments/     # Tournament pages
│   └── users/           # User profile pages
└── hooks.server.ts      # Server hooks (auth middleware)
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run check` | Run svelte-check |
| `bun generate` | Generate Prisma client |
| `bun migrate` | Run database migrations |

## Database

The schema is defined in `prisma/schema.prisma`. Key models:

- **User** - Steam-authenticated users
- **Team** - 2v2 teams with players
- **Match** - League matches with games
- **Season** - League seasons per region/format
- **Tournament** - 1v1 tournaments
- **Championship** - Annual world championships

### Migrations

```bash
# Create a new migration
bunx prisma migrate dev --name your_migration_name

# Apply migrations to production
bunx prisma migrate deploy
```

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t mge-next .
docker-compose up -d
```

See `docker-compose.yml` for required environment variables.

### Manual

```bash
bun run build
bun build/index.js
```

The server runs on `PORT` (default: 3000).

## Key Features

- **2v2 League**: Seasonal leagues with divisions, regions, and playoffs
- **1v1 Tournaments**: Bracket-style tournaments with prizes
- **World Championships**: Annual 1v1 championship event
- **Team Management**: Create/join teams, roster management
- **Match Reporting**: Submit scores, demos, and handle disputes
- **Admin Panel**: User management, match creation, site content CMS
- **PayPal Integration**: League fee payments
- **Demo System**: Upload and review match demos

## Contributing

1. Create a feature branch from `development`
2. Make your changes
3. Test locally
4. Submit a PR to `development`
