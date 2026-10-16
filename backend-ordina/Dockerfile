# ORDINA AI backend (Express + Prisma + SQLite). Built and run by Railway.
FROM node:24-bookworm-slim

# Compilers for native modules (better-sqlite3, argon2) when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# postinstall runs "prisma generate", which needs the schema and config.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund

COPY src ./src

# The SQLite file lives on a Railway volume mounted at /data (DATABASE_URL=file:/data/ordina.sqlite).
EXPOSE 4000
CMD ["npm", "run", "start:prod"]
