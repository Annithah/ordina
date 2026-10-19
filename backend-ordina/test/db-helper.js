/**
 * Database tests run against a throwaway PostgreSQL database (TEST_DATABASE_URL, e.g. a Neon
 * test branch). Each run uses its own schema, applies the migrations, and drops it afterwards.
 * Without TEST_DATABASE_URL these tests are skipped.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const base = process.env.TEST_DATABASE_URL || '';
const schema = `test_${process.pid}_${Date.now()}`;
const skip = !base;

function withSchema(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

let prisma = null;

/** Sets DATABASE_URL to a fresh schema, applies migrations, returns the Prisma client. */
function setup() {
  if (skip) return null;
  const url = withSchema(base);
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_UNPOOLED = url;
  const backendRoot = path.resolve(__dirname, '..');
  execFileSync(process.execPath, [path.join(backendRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env },
    stdio: 'ignore',
  });
  // The pg adapter needs the schema passed explicitly.
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: base }, { schema }) });
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true, id: 'prisma', filename: 'prisma' };
  return prisma;
}

async function teardown() {
  if (!prisma) return;
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
  await prisma.$disconnect();
}

module.exports = { skip, setup, teardown, schema };
