# empire-agora — multi-stage build → small standalone Node server for the Hetzner VPS.
#
# Mirrors EEC-MATERIAL/web's Dockerfile deliberately: that pattern is already proven
# in production on this box, and a cutover day is the wrong time to also debut a new
# build shape. Differences from that file are only the ones this app actually needs.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000

# No HEALTHCHECK here on purpose: the box's existing watchdog checks services from
# outside, and a per-container healthcheck would be a second, divergent source of
# truth about whether this is up.
CMD ["node", "server.js"]
