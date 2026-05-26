# ==============================================================================
# Dockerfile — MongoDB Server (Express + TypeScript Backend)
# ==============================================================================
# Multi-stage build with two targets:
#   - "development"  → used by docker-compose for local dev (nodemon + ts-node)
#   - "production"   → compiles TS → JS, runs lean Node image (no devDeps)
#
# docker-compose targets the "development" stage by default.
# To build a production image manually:
#   docker build --target production -t neview-backend .
# ==============================================================================


# ── Shared base ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Copy manifests first for layer-cache optimisation.
# Docker only re-runs `npm install` if package*.json changes.
COPY package*.json ./


# ── Development stage ─────────────────────────────────────────────────────────
FROM base AS development

# Install ALL dependencies (including devDeps like ts-node, nodemon, typescript)
RUN npm install

# Copy source (overridden at runtime by the bind-mount in docker-compose,
# but needed so the image works standalone)
COPY . .

EXPOSE 4000

# nodemon watches .ts files and restarts via ts-node on every save
CMD ["npm", "run", "dev:watch"]


# ── Build stage (production only) ─────────────────────────────────────────────
FROM base AS builder

RUN npm install

COPY . .

# Compile TypeScript → JavaScript (output goes to ./dist)
RUN npm run build


# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./

# Install ONLY production dependencies — no TypeScript compiler, no nodemon
RUN npm install --omit=dev

# Copy compiled JS from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 4000

# Run the compiled JavaScript directly — no ts-node overhead in production
CMD ["node", "dist/app.js"]
