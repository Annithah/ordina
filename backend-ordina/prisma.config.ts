import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    // Development: SQLite file on this laptop.
    url: process.env.DATABASE_URL || 'file:./data/ordina.sqlite'
  }
});
