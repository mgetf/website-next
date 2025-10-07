# Build stage
FROM node:lts-alpine AS builder
WORKDIR /app

# Install OS deps for Prisma engines (glibc etc.) and build tooling
RUN apk add --no-cache openssl

# Copy manifests and install deps
COPY package.json pnpm-lock.yaml* .npmrc* ./
# Use pnpm with the existing lockfile for deterministic installs
RUN npm i -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client and build SvelteKit
RUN npx prisma generate
RUN pnpm build

# Runtime stage
FROM node:lts-alpine AS runner
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

CMD [ "node", "./build/index.js" ]
