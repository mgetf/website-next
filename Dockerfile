# Build stage
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Install OS deps for Prisma engines
RUN apk add --no-cache openssl

# Copy manifests and install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Generate SvelteKit types first (required for tsconfig.json which prisma.config.ts needs)
RUN bun run prepare

# Generate Prisma client and build SvelteKit
# prisma.config.ts has a fallback URL for build - real DATABASE_URL provided at runtime
RUN bunx prisma generate
RUN bun run build

# Runtime stage
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/prisma prisma/
COPY package.json .

EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV ADDRESS_HEADER=CF-Connecting-IP

CMD [ "bun", "run", "./build/index.js" ]
