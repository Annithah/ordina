require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string (Neon in production, `prisma dev` locally). See backend-ordina/.env.example');
}

// Neon suspends idle databases, so allow a few seconds for the first connection to wake it.
const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000, max: 5 });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
