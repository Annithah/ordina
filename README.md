# ORDINA

AI-powered personal productivity for Android and iOS.

> Tell ORDINA what you need to do. Let ORDINA put it in order.

ORDINA turns natural-language (and optional voice) instructions into real tasks, reminders, and a schedule. You confirm before anything important is saved.

## What it does

- Email/password accounts with JWT sessions, optional Google / Apple sign-in, password reset codes, and an optional app PIN
- Tasks, projects, goals, reminders, recurrence, and a notification inbox
- Home, calendar, search, light/dark theme, and multiple languages
- ORDINA AI: create several tasks from one instruction, reschedule, “what should I do now?”, “I’m overwhelmed”, conflict-aware times
- Phone integrations (optional): microphone, notifications, contacts, calendar, location, camera/files

## Run locally

Need **Node.js 24**. Use **two terminals**.

### 1. API

```bash
cd backend-ordina
copy .env.example .env   # Windows
npm install
npm run db:dev      # local PostgreSQL via `prisma dev` (once per session)
npm run db:setup    # apply migrations
npm run dev
```

The database is PostgreSQL: local `prisma dev` for development, Neon in production.

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

### 2. App

```bash
cd frontend-ordina
copy .env.example .env
npm install
npm start
```

Scan the QR code with **Expo Go**. If port 8081 is busy, choose the next port.

If a phone cannot open the QR code, run `npm run start:phone` from `frontend-ordina` and scan the newly generated code. On iPhone with SDK 57, sign in to the same Expo account in both Expo Go and the terminal's Expo CLI. Android users should scan from Expo Go's built-in QR scanner. A physical phone also needs a reachable API address: set `EXPO_PUBLIC_API_URL` to `http://YOUR_COMPUTER_LAN_IP:4000` (not `localhost`) and restart Expo.

| Device | `EXPO_PUBLIC_API_URL` in `frontend-ordina/.env` |
| --- | --- |
| Same computer / iOS simulator | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| Physical phone | `http://YOUR_LAN_IP:4000` |

Restart Expo after changing the API URL.

## AI

The **mobile app never holds the Gemini key**. The API calls Gemini.

| Variable | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `backend-ordina/.env` | Natural-language, voice transcription, image → task |
| `GEMINI_MODEL` | same file | Default `gemini-3.8-flash` (with automatic fallbacks) |
| `JWT_SECRET` | same file | Sign-in tokens |
| `GOOGLE_CLIENT_ID` | same file | Verify Google ID tokens from the Web OAuth client |
| `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` | same file | Verify native Google ID tokens |
| `APPLE_CLIENT_ID`, `APPLE_BUNDLE_ID` | same file | Verify Sign in with Apple |
| `SMTP_HOST` | same file | Send password-reset codes by email |
| `DATABASE_URL` | same file | PostgreSQL connection string (local `prisma dev`, or Neon in production) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | `frontend-ordina/.env` | Google Web OAuth client for sign-in and Calendar |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | same file | Native Google OAuth clients for sign-in and Calendar |

If Gemini is missing or down, ORDINA still plans with its built-in parser (multiple tasks, relative dates, reschedule, arrival reminders). Voice transcription and image → task **require** `GEMINI_API_KEY`. Confirm is always required before tasks are written. Without SMTP, forgot-password still works: the 6-digit code is shown in the app.

### Before publishing integrations

- Google sign-in and Calendar require OAuth clients for the Web, iOS (`com.ordina.app`), and Android (`com.ordina.app`) platforms in the same Google Cloud project. Enable the Google Calendar API. Configure the OAuth consent screen and add the Calendar Events scope (`https://www.googleapis.com/auth/calendar.events`); while the app is in testing, add test users. Google may require consent-screen verification before public use of Calendar scopes.
- Set matching public client IDs in `frontend-ordina/.env` and private verification client IDs in `backend-ordina/.env`. Never put provider secrets in the Expo app.
- Apple sign-in requires the Apple capability and matching bundle identifier (`com.ordina.app`), plus the backend Apple audience configuration.
- Local task notifications need a native development/production build. Android Expo Go does not support the app's scheduled reminders. Voice transcription requires a working backend `GEMINI_API_KEY`; typing task requests continues to work without it.

### Example

“Tomorrow I need to finish my React project, study PostgreSQL for two hours, call John at 4 PM, and go to the gym in the evening.”

ORDINA proposes four dated tasks. You tap **Confirm & save**.

## Layout

```text
MobileApplication/
  frontend-ordina/   Expo Router (SDK 57)
  backend-ordina/    Express + Prisma + PostgreSQL
```

## API (authenticated unless noted)

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `/login`, `/google`, `/apple`, `/forgot`, `/reset` |
| Places | `GET/POST /api/places`, `DELETE /api/places/:id` |
| Tasks | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/complete` |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Goals / reminders | `/api/goals`, `/api/reminders` |
| Notifications | `GET /api/notifications`, read/delete |
| Dashboard | `GET /api/dashboard` |
| AI | `POST /api/ai/interpret`, `/from-image`, `/transcribe`, `/confirm`, `GET /api/ai/messages` |

Every protected record is scoped to the signed-in user.

## Theme

Light is default (`#F8FAFC`, primary `#5C4DF2`). Dark follows the Figma board. Switch in **Profile → Appearance**.

## Limitations (honest)

- Google / Apple sign-in only work after you set real client IDs. Missing keys return 503 or an in-app message — they are not faked.
- Password-reset email needs `SMTP_*`. Without SMTP, the app shows the reset code instead of sending mail.
- Voice recording works in Expo Go (short clips). Transcription still needs `GEMINI_API_KEY`. A native build is more stable for long recordings.
- Arrival reminders watch GPS **while the app is open** (Expo Go cannot run reliable background geofences). Save Home/Work in Integrations first.
- Image → task needs `GEMINI_API_KEY`. You still confirm before tasks are saved.

## Tests

```bash
cd backend-ordina
npm test
npm run db:test:prisma
node -e "const r=require('./src/lib/ai').localInterpret('Tomorrow study React for 2 hours and call John at 4 PM', []); console.log(JSON.stringify(r,null,2))"
```

Frontend: `npx tsc --noEmit` in `frontend-ordina`.

## Database

See `backend-ordina/DATABASE.md`. Do not wipe production data; only additive Prisma migrations.

## Design

Figma: [ORDINA_APP](https://www.figma.com/design/SCVeMG4DD2DVHn5QAk3gbW/ORDINA_APP?node-id=0-1)

## Release builds

1. **Backend (free):** Render web service + Neon Postgres. Step-by-step guide: [`backend-ordina/DEPLOY-RENDER.md`](backend-ordina/DEPLOY-RENDER.md). The blueprint is [`render.yaml`](render.yaml).
2. Put the Render HTTPS URL into `EXPO_PUBLIC_API_URL` in [`frontend-ordina/eas.json`](frontend-ordina/eas.json) (`preview` and `production` profiles). The store build refuses to build without an HTTPS address.
3. **Installable APK** for your own phone (EAS free plan): `npx eas-cli build -p android --profile preview`.
4. **Google Play (later):** the `production` profile builds an `.aab` (`npx eas-cli build -p android --profile production`). Store build scope (Tasks + ORDINA AI only, microphone permission only) is set in [`frontend-ordina/src/config/release.ts`](frontend-ordina/src/config/release.ts) and [`frontend-ordina/app.config.js`](frontend-ordina/app.config.js). The privacy policy draft is in [`store/privacy-policy.md`](store/privacy-policy.md).
