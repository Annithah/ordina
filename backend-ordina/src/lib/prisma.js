require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// PostgreSQL: Neon in production (pooled connection, host contains "-pooler"), or a local
// `prisma dev` database during development. See .env.example.
const connectionString = process.env.DATABASE_URL || '';
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string (see backend-ordina/.env.example).');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

module.exports = prisma;
