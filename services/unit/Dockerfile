# ═══════════════════════════════════════════════════════════════════════
# unit service
# Build context: REPO ROOT
#   docker build -f services/unit/Dockerfile -t niloyrudra/unit .
# ═══════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy pre-built shared package (built at repo root)
COPY shared/dist ./shared/dist
COPY shared/package.json ./shared/package.json

# Install shared dependencies (needed for shared node_modules)
WORKDIR /app/shared
RUN npm install

WORKDIR /app

# ── Stage 2: Runtime ──────────────────────────────────────────────────
# Copy and build the service
WORKDIR /app/services/unit
COPY services/unit/package*.json ./
RUN npm install

COPY services/unit/tsconfig*.json ./
COPY services/unit/src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled JS
COPY --from=builder /app/services/unit/dist ./dist

# Copy node_modules
COPY --from=builder /app/services/unit/node_modules ./node_modules

# Copy package.json
COPY --from=builder /app/services/unit/package.json ./

# Copy pre-built shared package to /shared (resolved by file:../../shared from /app/dist)
COPY --from=builder /app/shared/dist /shared/dist
COPY --from=builder /app/shared/package.json /shared/package.json
COPY --from=builder /app/shared/node_modules /shared/node_modules

CMD ["node", "dist/index.js"]