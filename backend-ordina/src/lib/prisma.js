require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

// Development setup: one SQLite file on this laptop (default backend-ordina/data/ordina.sqlite).
// It only holds AI personalization and device sessions; tasks live on the phone.
const databaseUrl = process.env.DATABASE_URL || 'file:./data/ordina.sqlite';
if (!/^file:/i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must be a SQLite file URL such as file:./data/ordina.sqlite (see backend-ordina/.env.example)');
}

const relative = databaseUrl.replace(/^file:/i, '').replace(/^\/\/\//, '').replace(/^\/\//, '');
const backendRoot = path.resolve(__dirname, '..', '..');
const absolute = path.isAbsolute(relative) ? relative : path.resolve(backendRoot, relative);
fs.mkdirSync(path.dirname(absolute), { recursive: true });

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: absolute }) });

module.exports = prisma;
