# Archived PostgreSQL migrations (Neon)

During development ORDINA runs on SQLite (`../migrations`). This PostgreSQL baseline is kept
for a later move back to Neon/Render (see `../../DEPLOY-RENDER.md` and `/render.yaml`).
To use it again: set `provider = "postgresql"` in `schema.prisma`, move this folder back to
`migrations`, and switch `src/lib/prisma.js` to `@prisma/adapter-pg`.

Prisma does not read this folder.
