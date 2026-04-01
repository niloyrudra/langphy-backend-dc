# ═══════════════════════════════════════════════════════════════════════
# progress service
# Build context: REPO ROOT
#   docker build -f services/progress/Dockerfile -t niloyrudra/progress .
# ═══════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy and build shared package first (cached layer)
COPY shared/package*.json ./shared/
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install && npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────
# Copy and build the service
WORKDIR /app/services/progress
COPY services/progress/package*.json ./
RUN npm install

COPY services/progress/tsconfig*.json ./
COPY services/progress/src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# ── Step 3: replace symlink with real shared package + its deps ───────
# npm resolves "file:../../shared" as a symlink. We replace it with the
# actual built files INCLUDING shared/node_modules so zod and other
# shared deps are resolvable at runtime.
RUN rm -rf node_modules/@langphy/shared &&     mkdir -p node_modules/@langphy/shared &&     cp -r /app/shared/dist node_modules/@langphy/shared/dist &&     cp -r /app/shared/node_modules node_modules/@langphy/shared/node_modules &&     cp /app/shared/package.json node_modules/@langphy/shared/package.json

# ── Runtime ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled JS
COPY --from=builder /app/services/progress/dist ./dist

# Copy node_modules (includes @langphy/shared built above)
COPY --from=builder /app/services/progress/node_modules ./node_modules

# Copy package.json (needed by node module resolution)
COPY --from=builder /app/services/progress/package.json ./

# ── CRITICAL: copy SQL migration files ────────────────────────────────
# migrate.js reads SQL files at runtime using:
#   path.join(process.cwd(), "src/db/migrations")
# process.cwd() = WORKDIR = /app
# So SQL files must exist at: /app/src/db/migrations/
COPY services/progress/src/db/migrations ./src/db/migrations

CMD ["node", "dist/index.js"]