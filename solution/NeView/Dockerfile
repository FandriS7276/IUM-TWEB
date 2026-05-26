# ==============================================================================
# Dockerfile — NeView (React + Vite) — Development Mode
# ==============================================================================
# Strategy: single-stage dev image.
#   - We install deps inside the image for a clean baseline.
#   - docker-compose mounts ./NeView:/app at runtime so your local edits
#     are reflected instantly (HMR), while /app/node_modules stays isolated
#     inside the container via an anonymous volume.
# ==============================================================================

# Use the official Node.js LTS image on Alpine (small footprint ~50 MB)
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# ── Layer-cache optimisation ──────────────────────────────────────────────────
# Copy ONLY the dependency manifests first.
# Docker caches this layer and skips `npm install` on subsequent builds
# as long as package*.json hasn't changed — saving minutes of build time.
COPY package*.json ./

# Install dependencies (including devDependencies, needed for Vite)
RUN npm install

# Copy the rest of the source code
# (In development this layer is overridden by the bind-mount in compose,
#  but it ensures the image works standalone too.)
COPY . .

# Expose the Vite dev server port
EXPOSE 5173

# Start Vite dev server.
# --host binds to 0.0.0.0 (all network interfaces) instead of localhost,
# which is required for the port to be reachable outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
