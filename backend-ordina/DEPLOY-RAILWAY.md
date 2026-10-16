# Deploy the ORDINA AI backend on Railway

The Android app talks only to this backend over HTTPS. The Gemini key lives here, never in the app.

What is already in the repo:

| File | Purpose |
| --- | --- |
| `Dockerfile` | Node 24 image with compilers for the native SQLite / argon2 modules |
| `railway.json` | Tells Railway to use the Dockerfile, start with `npm run start:prod`, health-check `GET /health` |
| `package.json` → `start:prod` | Runs `prisma migrate deploy`, then starts the server |

## One-time setup (about 10 minutes)

1. Sign in at <https://railway.com> with the GitHub account that owns the repo (**Annithah**). Add a payment method (Hobby plan, about $5/month) so the service stays on.
2. **New Project → Deploy from GitHub repo →** `Annithah/ordina`.
3. Open the new service → **Settings**:
   - **Source → Root Directory:** `/backend-ordina`
   - **Source → Branch:** `frontend-ordina-001`
4. **Add a volume** (right-click the service → *Attach volume*, or `Ctrl/Cmd+K` → *Volume*). **Mount path:** `/data`. This keeps the SQLite database across deploys.
5. Service → **Variables**. Add these, using the same names as your local `.env`:

   | Name | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | `file:/data/ordina.sqlite` |
   | `JWT_SECRET` | 64 random hex characters. Generate them with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `GEMINI_API_KEY` | your Gemini key (same variable name as local) |
   | `GEMINI_MODEL` | optional, default `gemini-3.8-flash` |

   Do **not** set `PORT`; Railway provides it.
6. Service → **Settings → Networking → Generate Domain.** You get `https://<name>.up.railway.app` (HTTPS only).
7. Railway builds and deploys. In **Deployments → View logs** you should see:
   - `All migrations have been successfully applied`
   - `ORDINA AI: Gemini model …`
   - `ORDINA backend listening …`
8. Open `https://<name>.up.railway.app/health`. It should show `{"ok":true}`.

Send the domain back. The app's production build reads it from `EXPO_PUBLIC_API_URL` in `frontend-ordina/eas.json`.

## What production mode changes

- Refuses to start without a strong `JWT_SECRET` (32+ characters).
- Trusts Railway's proxy, so rate limits use the real client IP.
- Request limits: 200/min overall, 30/min for AI routes, 20 per 15 min for sign-in, password reset and account deletion.
- No browser CORS unless `CORS_ORIGINS` is set (the Android app does not need CORS).
- Logs contain only method, path, status and timing. No request bodies, task text or prompts.
- Forgot-password never returns the reset code. Without SMTP it answers "not available".
- Public account-deletion page at `/account/delete` (required by Google Play).

## Backups

The whole database is the single file `/data/ordina.sqlite` on the volume. Railway volume backups can be enabled in the volume's settings. Turn them on before real users arrive.
