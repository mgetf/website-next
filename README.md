# MGE.tf - SvelteKit Migration

> Modern rebuild of the MGE.tf competitive Team Fortress 2 league platform

[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

---

## 🎯 Project Overview

This is a complete rewrite of [mge.tf](https://mge.tf) from Express.js/EJS to SvelteKit with Svelte 5. MGE.tf is a competitive platform for Team Fortress 2's MGE (My Gaming Edge) format - a 1v1 arena-style game mode for competitive practice.

### What We're Building
- **2v2 League System**: Teams compete in seasonal divisions across multiple regions
- **Tournament Platform**: Fight Nights, 2v2 cups, World Championships
- **Team Management**: Roster management, match scheduling, payment processing
- **Admin Tools**: Team approval, match moderation, analytics
- **Community Features**: Forums, player profiles, ELO leaderboards

---

## 🏗️ Architecture

### Tech Stack

**Frontend**
- **SvelteKit 2.x** - Full-stack framework
- **Svelte 5** - UI with runes (`$state`, `$derived`, `$effect`)
- **TypeScript** - Type safety throughout
- **Tailwind CSS v4** - Styling
- **Vite** - Build tool

**Backend**
- **SvelteKit Server** - API routes and server actions
- **Prisma ORM** - Type-safe database queries with auto-generated types
- **PostgreSQL** - Production-grade relational database
- **@prisma/client** - Prisma client for database access

**Integrations**
- **Steam OpenID** - Authentication
- **Discord OAuth** - Account linking
- **PayPal SDK** - Payment processing
- **AWS S3** - File storage (demos, avatars)
- **PostHog** - Analytics

---

## 📁 Project Structure

```
mge-next/
├── prisma/
│   ├── schema.prisma            # Prisma schema (database models)
│   └── migrations/              # Database migrations
├── src/
│   ├── lib/
│   │   ├── server/              # Server-only code
│   │   │   ├── db/              # Database utilities
│   │   │   │   ├── index.ts     # Prisma client singleton
│   │   │   │   └── queries/     # Reusable query functions
│   │   │   ├── auth/            # Authentication
│   │   │   │   ├── steam.ts
│   │   │   │   └── discord.ts
│   │   │   ├── integrations/    # External services
│   │   │   │   ├── paypal.ts
│   │   │   │   ├── s3.ts
│   │   │   │   └── posthog.ts
│   │   │   └── utils/           # Server utilities
│   │   │       ├── permissions.ts
│   │   │       ├── validation.ts
│   │   │       └── logger.ts
│   │   ├── components/          # Svelte components
│   │   │   ├── ui/              # Reusable UI
│   │   │   ├── layout/          # Layout components
│   │   │   └── forms/           # Form components
│   │   ├── stores/              # Client stores (Svelte 5 runes)
│   │   ├── types/               # TypeScript types
│   │   └── utils/               # Universal utilities
│   ├── routes/                  # SvelteKit routes
│   │   ├── (app)/               # Main app layout
│   │   ├── (auth)/              # Auth routes
│   │   ├── admin/               # Admin panel
│   │   └── api/                 # API endpoints
│   ├── app.html                 # HTML template
│   └── hooks.server.ts          # Server hooks
├── static/                      # Static assets
├── tests/                       # Tests
├── MIGRATION_PLAN.md            # Detailed migration plan
├── DEV_RULES.md                 # Development guidelines
├── PROJECT_CONTEXT.md           # Quick reference
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- PostgreSQL 14+ (or Docker)

### Installation

```bash
# Clone the repo (once initialized)
cd mge-next

# Install dependencies
npm install

# Copy environment template
cp env.example .env

# Edit .env with your credentials
# - PostgreSQL DATABASE_URL
# - Steam API key
# - Discord OAuth credentials
# - PayPal credentials
# - AWS S3 credentials

# Set up local PostgreSQL
# Option 1: Install PostgreSQL locally
# Option 2: Docker: docker run --name mge-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# Run Prisma migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# (Optional) Seed database with test data
npx prisma db seed

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file:

```bash
# Node Environment
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/mge_tf"
# For production (Render.com): postgresql://user:password@host:port/dbname

# Steam Auth
STEAM_API_KEY=your_steam_api_key
STEAM_REALM=http://localhost:5173/
STEAM_RETURN_URL=http://localhost:5173/verify

# Discord OAuth
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:5173/auth/discord/callback

# PayPal (use sandbox for development)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_BUCKET_NAME=mge-tf-uploads

# PostHog
POSTHOG_API_KEY=phc_your_posthog_key
POSTHOG_HOST=https://us.i.posthog.com

# Session
SESSION_SECRET=your_random_secret_string
```

---

## 📚 Documentation

- **[Migration Plan](./MIGRATION_PLAN.md)** - Detailed phase-by-phase migration strategy
- **[Development Rules](./DEV_RULES.md)** - Code style, Svelte 5 syntax, architecture patterns
- **[Project Context](./PROJECT_CONTEXT.md)** - Quick reference for domain models and workflows

---

## 🔨 Development Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database (Prisma)
npx prisma generate      # Generate Prisma Client
npx prisma migrate dev   # Create and run migrations (dev)
npx prisma migrate deploy # Run migrations (production)
npx prisma studio        # Open Prisma Studio (visual DB editor)
npx prisma db seed       # Seed database with test data
npx prisma db push       # Push schema changes (prototyping)

# Testing
npm run test             # Run tests
npm run test:unit        # Unit tests only
npm run test:e2e         # E2E tests

# Code Quality
npm run lint             # Lint code
npm run format           # Format with Prettier
npm run type-check       # TypeScript check
```

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run specific test file
npm run test src/lib/utils/formatters.test.ts

# Run tests in watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 📦 Deployment

### Build

```bash
# Generate Prisma Client and build
npx prisma generate && npm run build
```

### Deploy to Render.com

1. **Add PostgreSQL Database**:
   - Create PostgreSQL addon in Render dashboard
   - Copy `DATABASE_URL` (internal connection string)

2. **Configure Web Service**:
   - Connect GitHub repository
   - Set build command: `npx prisma generate && npx prisma migrate deploy && npm run build`
   - Set start command: `node build/index.js`
   - Add environment variables from `.env`
   - Add `DATABASE_URL` from PostgreSQL addon

3. **Database Migrations**:
   - Migrations run automatically on deploy
   - Manual migration: `npx prisma migrate deploy`

---

## 🗺️ Migration Status

Current phase: **Phase 2 - Core Pages & Layouts**

See [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for detailed progress.

### Completed Phases
- [x] Planning & documentation
- [x] Phase 1: Foundation & Infrastructure ✅

### In Progress
- [ ] Phase 2: Core Pages & Layouts

### Upcoming
- [ ] Phase 3: User System & Profiles
- [ ] Phase 4: Match & Game Management
- [ ] Phase 5: Payment Integration
- [ ] Phase 6: Tournaments & Events
- [ ] Phase 7: Admin Panel
- [ ] Phase 8: Community Features
- [ ] Phase 9: Advanced Features & Polish
- [ ] Phase 10: Testing & Migration Prep
- [ ] Phase 11: Production Cutover

---

## 🤝 Contributing

Since this is a migration project, contributions should:

1. Follow the [Development Rules](./DEV_RULES.md)
2. Use Svelte 5 runes syntax exclusively
3. Match or improve upon existing functionality
4. Include tests for new features
5. Update documentation as needed

### Code Style

- **Svelte 5**: Always use `$state`, `$derived`, `$effect`, `$props()` - no legacy syntax
- **TypeScript**: Strict mode, no `any` types
- **Formatting**: Prettier with defaults (2 spaces, single quotes)
- **Linting**: ESLint with Svelte rules

---

## 📝 License

This project is for the MGE.tf community.

---

## 🙏 Credits

- **Original Website**: Built with Express.js + EJS
- **Community**: MGE.tf players and staff
- **Framework**: SvelteKit team
- **Hosting**: Render.com

---

## 🔗 Links

- **Live Site**: [mge.tf](https://mge.tf)
- **Discord**: [discord.gg/j6kDYSpYbs](https://discord.gg/j6kDYSpYbs)
- **Steam Group**: TF2 MGE Community
- **YouTube**: [@mge.tf.1v1](https://www.youtube.com/@mge.tf.1v1)

---

## 📞 Support

For issues or questions:
- Create an issue in this repository
- Ask in the [Discord server](https://discord.gg/j6kDYSpYbs)
- Contact the development team

---

**Built with ❤️ for the TF2 competitive community**