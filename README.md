# ORDINA

AI-powered daily planning for Android (and iOS).

> Tell ORDINA what you need to do. Let ORDINA put it in order.

## What it does (version 2)

- **Offline-first tasks** on the phone (SQLite): a day plus a time or **Anytime**, optional duration
  (15 min / 30 min / 1 h / 2 h / custom 5 min–12 h), priority, one **category** per task, overlap warnings.
- **Write your whole plan in one paragraph**: ORDINA splits it into tasks on the phone (no internet), never guessing times.
- **Categories**: 8 defaults (Work, Study, Personal, Health & Fitness, Family, Finance, Errands, Other), plus your own
  (name, color, icon), reorder, delete (tasks move, never disappear). Suggested from the task title.
- **Home**: search as you type, filters (category, status, date, priority) with removable chips, By time / By category.
- **Reminders**: local notifications (none, at start, 5/15/30 min, 1 hour, 1 day before, custom); tap opens the task.
- **ORDINA AI** (needs internet): turns your words into a plan you edit before saving. Offline: a clear message, nothing sent.
- **English, French, Kinyarwanda** (phone language on first launch, switch any time). See `TRANSLATIONS_TO_REVIEW.md`.
- **Backup**: export/import a backup file (share menu), backup reminders, and optional **email account** for automatic
  server backup and sync between phones.

## Layout

```text
frontend-ordina/   Expo SDK 57 app (expo-router, zustand, expo-sqlite)
  src/logic/       pure rules with unit tests (time, categories, filters, reminders, backup, sync, migrations)
  src/i18n/        en.ts, fr.ts, rw.ts + formatting
backend-ordina/    Express + Prisma + PostgreSQL (Neon): ORDINA AI, accounts, sync
render.yaml        Render blueprint (free plan, Ohio)
```

## Run locally

Node.js 24. Two terminals.

```bash
# 1. API
cd backend-ordina
copy .env.example .env     # fill in DATABASE_URL / DATABASE_URL_UNPOOLED (Neon) and GEMINI_API_KEY
npm install
npm run db:setup           # apply migrations
npm run dev                # http://localhost:4000/health

# 2. App
cd frontend-ordina
npm install
npm start
```

The app reads the server address from `EXPO_PUBLIC_API_URL`. Without a reachable server the app keeps working
offline; only ORDINA AI and account sync wait.

## Tests

```bash
cd frontend-ordina && npm test && npm run typecheck
cd backend-ordina && npm test        # database tests need TEST_DATABASE_URL (a throwaway database)
```

## API

| Area | Routes |
| --- | --- |
| Health | `GET /health`, `GET /api/health` |
| Accounts | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/forgot`, `/reset`, `/change-password`, `DELETE /api/auth/account` |
| Sync | `POST /api/sync` (signed in; per-user records, newest change wins) |
| ORDINA AI | `POST /api/device/session`, `/api/ai/plan`, `/api/ai/plan/learn`, `/api/ai/transcribe` |

Every error answer has a `code` the app translates. A user can only ever access their own data.

## Release

1. **Backend:** Render + Neon, see [`backend-ordina/DEPLOY-RENDER.md`](backend-ordina/DEPLOY-RENDER.md).
2. Put the Render HTTPS URL in `frontend-ordina/eas.json` (`EXPO_PUBLIC_API_URL`, `preview` and `production`).
3. Test APK: `npx eas-cli build -p android --profile preview`. Play Store bundle: `--profile production`.

Privacy policy draft: [`store/privacy-policy.md`](store/privacy-policy.md).
