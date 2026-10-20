import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    // Migrations use Neon's DIRECT connection (no "-pooler"); the running server uses the pooled one.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || ''
  }
});
