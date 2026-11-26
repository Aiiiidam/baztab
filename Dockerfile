# syntax=docker/dockerfile:1.7
# baztab-web (decision 011): standalone Next.js, non-root, port 3000, ffprobe for
# upload validation. Migrations are NOT run here; see Dockerfile.migrate.

# ─── Base ─────────────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    # Prisma engine mirror for networks where the default CDN is blocked.
    PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# deb.debian.org can be unreachable from some networks (e.g. Iranian IaaS).
# Uncomment one mirror if apt-get fails:
#   RUN sed -i 's|deb.debian.org|mirror.arvancloud.ir|g' /etc/apt/sources.list.d/debian.sources
#   (alternatives: mirror.iranserver.com, repo.iut.ac.ir, mirror.pars.host)
RUN apt-get -o Acquire::Check-Valid-Until=false update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ─── Builder ──────────────────────────────────────────────────────────────
FROM base AS builder

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

COPY . .
RUN npx prisma generate

# `next build` evaluates src/lib/env.ts; a syntactically valid placeholder is enough.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PROCESS_ROLE=web \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FFPROBE_PATH=/usr/bin/ffprobe \
    UPLOAD_SCRATCH_DIR=/tmp/baztab-uploads

# ffprobe validates uploaded MP3s (tech spec §6).
RUN apt-get -o Acquire::Check-Valid-Until=false update -y \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /data/storage && chown nextjs:nodejs /data/storage

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migration names only, for the schema-readiness check (/api/health).
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
# Supabase root CA for verified TLS to the pooler (sslcert=/app/prisma/supabase-ca.crt).
COPY --from=builder --chown=nextjs:nodejs /app/prisma/supabase-ca.crt ./prisma/supabase-ca.crt

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
