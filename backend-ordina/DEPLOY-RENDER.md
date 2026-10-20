# Deploy the ORDINA AI backend for free: Render (server) + Neon (database)

The Android app talks only to this backend over HTTPS. The Gemini key lives here, never in the app.
Both services have free plans and need no payment card.

## Free-tier limits (checked 16 Oct 2026)

| | Free plan | What it means for ORDINA |
| --- | --- | --- |
| **Render web service** | Sleeps after **15 min** without requests; waking takes **about 1 min**. 750 instance hours/month (sleeping time does not count). No persistent disk. May restart at any time. Outbound SMTP ports blocked. | The first request after a quiet period takes up to a minute. Release builds wait for it and the Tasks screen says "Waking up the ORDINA server". Data is safe because it lives in Neon. Password-reset emails are not possible on this plan, so reset answers "not available". |
| **Neon Postgres** | 1 GB storage per project, 100 CU-hours/month, suspends after **5 min** idle (cannot be disabled), 5 GB transfer/month, 6-hour restore window. | Plenty for personal use and testing. The first query after idle takes a moment to wake the database. |
| **Gemini API (free tier)** | Google may use prompts and responses to improve its products, and human reviewers may read them. | Disclosed in `store/privacy-policy.md`. Don't put sensitive information in tasks. |

Sources: render.com/docs/free, neon.com/docs/introduction/plans, ai.google.dev/gemini-api/terms.

## Steps (about 15 minutes)

### 1. Neon database (done)

The Neon project **`flat-bonus-90867196`** (branch `production`, database `neondb`, region **AWS us-east-2, Ohio**) is linked to this folder (`neon.ts`, `.neon`), and the migrations are applied.

Neon gives two connection strings. Both contain the database password, so keep them private:

| Render variable | Which string | How to recognise it | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Pooled** | host contains `-pooler` | The running server (Neon's recommendation for web apps) |
| `DATABASE_URL_UNPOOLED` | **Direct** | host has no `-pooler` | Database migrations at start-up |

Where to copy them from (either place):

- **Your computer:** `backend-ordina/.env`, the lines `DATABASE_URL=` and `DATABASE_URL_UNPOOLED=` (written by `neon deploy`, never committed).
- **Neon console:** <https://console.neon.tech> → project `flat-bonus-90867196` → **Connect** → branch `production`, database `neondb`, role `neondb_owner`. **Connection pooling ON** gives `DATABASE_URL`; **OFF** gives `DATABASE_URL_UNPOOLED`.

### 2. Render web service

1. Sign up at <https://render.com> with the **Annithah** GitHub account (the one that owns the repo). Free plan.
2. **New + → Blueprint →** connect `Annithah/ordina`. Render reads `render.yaml` from the repo root and proposes the service `ordina-api` (free plan, Node, root `backend-ordina`, branch `frontend-ordina-001`).
3. It asks for the three secret values:
   - `DATABASE_URL`: the Neon **pooled** string from step 1.
   - `DATABASE_URL_UNPOOLED`: the Neon **direct** string from step 1.
   - `GEMINI_API_KEY`: your Gemini key (same variable name as in your local `.env`).

   `JWT_SECRET` is generated automatically. `NODE_ENV=production` and `GEMINI_MODEL` are preset.
4. The blueprint puts the service in **Ohio**, the same AWS region as the Neon database (us-east-2). Keep it there.
5. Click **Apply**. The first build takes a few minutes. In **Logs** you should see:
   - `All migrations have been successfully applied`
   - `ORDINA AI: Gemini model gemini-3.8-flash`
   - `ORDINA backend listening …`
6. Your URL is shown at the top of the service page: `https://ordina-api-xxxx.onrender.com`. Open `…/health`. It should show `{"ok":true}`. If the service was asleep, the first try can take a minute.

Send the URL back. It goes into `frontend-ordina/eas.json` as `EXPO_PUBLIC_API_URL` for the APK build.

## What production mode does

- Runs `prisma migrate deploy` on every start (`npm run start:prod`, over the direct connection), then starts the server (pooled connection).
- Refuses to start without a strong `JWT_SECRET` (Render generates one).
- Rate limits: 200/min overall, 30/min for AI, 20 per 15 min for sign-in, password reset and account deletion.
- No browser CORS unless `CORS_ORIGINS` is set (the Android app needs none).
- Logs contain only method, path, status and timing. No request bodies, task text or prompts.
- Forgot-password never reveals a reset code (no email on the free plan, so it answers "not available").
- Public account-deletion page: `https://<your-url>/account/delete`.

## Local development

```bash
cd backend-ordina
npm install
npm run db:dev      # local Postgres via `prisma dev` (first time: creates it)
# .env: DATABASE_URL="postgres://postgres:postgres@localhost:51214/ordina?sslmode=disable"
#       (create the "ordina" database once, or use "template1")
npm run db:setup    # apply migrations
npm run dev
```

Optional, for the database tests: `TEST_DATABASE_URL` pointing at a throwaway database (each run uses and drops its own schema).
