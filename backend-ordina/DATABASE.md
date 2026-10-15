# ORDINA Database

SQLite via Prisma. Local development uses `@prisma/adapter-better-sqlite3`. Remote Turso/libSQL URLs still use `@prisma/adapter-libsql`. Default file: `data/ordina.sqlite` (`DATABASE_URL` in `.env`).

## Models

User accounts store a timezone and own tasks, projects, goals, reminders, notifications, AI messages, and categories.

- **Task** — schedule fields, recurrence series + occurrence rows, optional project/goal, reminders
- **Project** — status, priority, dates; progress is computed from tasks
- **Goal** — status (`not_started` / `in_progress` / `completed` / `archived`), priority, optional project
- **Reminder** — datetime, enabled flag, optional task/project/goal
- **Notification** — read state and related entity
- **AiMessage** — conversation history for the signed-in user only

Deleting a user cascades to their records. Completing a recurring **series** completes **today’s occurrence only**.

## Setup

```bash
cd backend-ordina
npm install
npm run db:generate
npm run db:setup
```

Never drop production data. Add additive migrations only.

## Verification

```bash
npm test
npm run db:test:prisma
```
