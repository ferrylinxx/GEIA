# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure build-time env is available for Next.js (NEXT_PUBLIC_* gets inlined at build)
RUN if [ ! -f .env.local ] && [ -f .env.example ]; then cp .env.example .env.local; fi
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Note: Sensitive environment variables should be provided via docker-compose.yml or .env.local
# Do not hardcode API keys in the Dockerfile for security reasons
ENV EMBEDDING_MODEL=text-embedding-3-large
ENV EMBEDDING_DIMENSIONS=1536
ENV DEFAULT_CHAT_MODEL=gpt-4o-mini
ENV NEXT_PUBLIC_APP_VERSION="V2.6.0"

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.env.local ./.env.local
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
