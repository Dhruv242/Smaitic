# ---- Stage 1: dependencies + build -----------------------------------------
FROM node:20.16-alpine AS builder
WORKDIR /app

ENV NODE_ENV=production

# Install ALL deps (incl. dev) needed to build, using a clean, reproducible install.
COPY app/package.json app/package-lock.json* ./
RUN npm ci --include=dev

# Copy source and build.
COPY app/ ./
RUN npm run build

# Strip dev dependencies so we copy only production node_modules forward.
RUN npm prune --omit=dev


# ---- Stage 2: minimal runtime ----------------------------------------------
FROM node:20.16-alpine AS runtime
WORKDIR /app

# tini handles signals/zombies; wget is used by the HEALTHCHECK.
RUN apk add --no-cache tini wget

ENV NODE_ENV=production \
    PORT=3000

# Copy only what's needed to run, owned by the built-in unprivileged `node` user.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Drop privileges.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
