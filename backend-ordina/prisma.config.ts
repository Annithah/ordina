import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    // Prisma CLI (migrations) uses the direct Neon connection; the server itself uses the
    // pooled DATABASE_URL (src/lib/prisma.js), as Neon recommends for long-running apps.
    url: process.env.DATABASE_URL_UNPOOLED || env('DATABASE_URL')
  }
});
