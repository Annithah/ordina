# Archived SQLite migrations

ORDINA used SQLite until October 2026. The database is now PostgreSQL (Neon in production,
`prisma dev` locally) and starts from the baseline in `../migrations/20261016000000_init_postgres`,
which already contains every table and column these migrations created.

Kept for reference only. Prisma does not read this folder.
