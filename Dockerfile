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
# `-G nodejs` is load-bearing. Without it `adduser -S` puts nextjs in `nogroup`, so the
# `--chown=nextjs:nodejs` below set a group the running user was not even a member of —
# the container ran as uid 1001 / gid 65533 while every file claimed gid 1001.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Create the ledger directory IN THE IMAGE, owned by the runtime user.
#
# This is not cosmetic. Docker initialises an empty named volume from the image's directory
# at that path, INCLUDING its ownership. With no /data in the image the volume was created
# root-owned, and the container — which correctly runs as non-root — could not write to it.
#
# The symptom was `SQLITE_ERROR: unable to open database file` on the first real order, in
# production, on deployment day. The order was refused honestly (the submit handler
# redirects with `e=storage` and never shows a confirmation for an order it did not store),
# so nothing was lost — but no order could be taken at all.
#
# An existing root-owned volume is NOT repaired by this; fix those on the host with
# `chown -R 1001:1001 $(docker volume inspect <vol> --format '{{.Mountpoint}}')`.
RUN mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000

# No HEALTHCHECK here on purpose: the box's existing watchdog checks services from
# outside, and a per-container healthcheck would be a second, divergent source of
# truth about whether this is up.
CMD ["node", "server.js"]
