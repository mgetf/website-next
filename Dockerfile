# Build stage
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy manifests and install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Generate SvelteKit types and build
RUN bun run prepare
RUN bun run build

# Runtime stage
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .

EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV ADDRESS_HEADER=CF-Connecting-IP

CMD [ "bun", "run", "./build/index.js" ]
