# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDeps needed for build)
COPY package*.json ./
RUN npm ci

# Copy source and config
COPY tsconfig.json tsconfig.server.json tsconfig.client.json ./
COPY webpack.config.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/

# Build server (TypeScript → JS) and client (webpack bundle)
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Copy production deps manifest, then install only runtime deps
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled server
COPY --from=builder /app/build/ ./build/

# Copy bundled client assets
COPY --from=builder /app/dist/ ./dist/

# Copy static public assets (index.html, card-art, etc.)
COPY --from=builder /app/public/ ./public/

# Copy game data files needed at runtime (cards.json, heroes.json, relics.json)
COPY --from=builder /app/data/ ./data/

# Game save files live in a mounted volume
VOLUME ["/app/db"]
ENV DB_PATH=/app/db

EXPOSE 8080

CMD ["node", "build/server/server.js"]
