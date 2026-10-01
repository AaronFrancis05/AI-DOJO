# Production image for AI DOJO (Next.js standalone)
# External services (Neon DB/Auth, Upstash, AI APIs) stay cloud-side via env vars.

ARG NODE_VERSION=22-bookworm-slim

# ----------------------------------------
# Dependencies
# ----------------------------------------
FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

# ----------------------------------------
# Build
# ----------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Auth/DB modules evaluate env at import time during `next build`.
# Real secrets are injected at runtime via docker-compose env_file.
#
# NEXT_PUBLIC_* is different: Next inlines those into the browser bundle
# at build. Runtime env_file cannot change them. Passing them here (and
# as compose/CI build-args) is what keeps the client and the Node server
# on the same flag — otherwise Teaching / Tutors surfaces SSR as on and
# hydrate as off.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG NEON_AUTH_BASE_URL=https://example.invalid
ARG NEON_AUTH_COOKIE_SECRET=build-time-placeholder-secret-min-32-chars
ARG APP_ORIGIN=http://localhost:3000
ARG NEXT_PUBLIC_TUTORS_ENABLED
ARG NEXT_PUBLIC_STREAM_API_KEY
ENV DATABASE_URL=${DATABASE_URL}
ENV NEON_AUTH_BASE_URL=${NEON_AUTH_BASE_URL}
ENV NEON_AUTH_COOKIE_SECRET=${NEON_AUTH_COOKIE_SECRET}
ENV APP_ORIGIN=${APP_ORIGIN}
ENV NEXT_PUBLIC_TUTORS_ENABLED=${NEXT_PUBLIC_TUTORS_ENABLED}
ENV NEXT_PUBLIC_STREAM_API_KEY=${NEXT_PUBLIC_STREAM_API_KEY}

RUN npm run build

# ----------------------------------------
# Runtime
# ----------------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next standalone binds to HOSTNAME. Docker sets this to the container name;
# with multiple networks that can resolve to the wrong NIC. Always listen on all interfaces.
ENV HOSTNAME=0.0.0.0

RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
