# ORDINA mobile app

Expo SDK 57 client for ORDINA.

## Setup

```bash
copy .env.example .env
npm install
npm start
```

`npm start` uses **Expo Go** over your local network. If scanning the QR code does not open the project, run `npm run start:phone` to use Expo's tunnel connection, then scan the new QR code. Tunnel mode can be slower than LAN mode.

For a physical iPhone using the current SDK 57 Expo Go, sign in to the same Expo account in Expo Go and in the terminal's Expo CLI. Android users should scan from **Expo Go → Scan QR code**. The phone and computer should use the same Wi-Fi when using the normal LAN connection.

`EXPO_PUBLIC_API_URL` defaults to `http://localhost:4000`, which works for web and simulators, not a physical phone. For a phone, set it to `http://YOUR_COMPUTER_LAN_IP:4000` in `.env` (for example, `http://192.168.1.25:4000`), keep the API running, and restart Expo. The phone and computer must be able to reach each other on the network; if using tunnel mode for Metro, the API still needs a reachable address too.

For Google sign-in and Calendar, set `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` to the matching OAuth clients. The iOS and Android clients must use the configured application identifiers (`com.ordina.app`). Enable Google Calendar API and add `https://www.googleapis.com/auth/calendar.events` to the OAuth consent screen; public use may require Google verification. Set the matching verification IDs in `backend-ordina/.env` too.

Use `http://10.0.2.2:4000` on the Android emulator and your computer's LAN IP on a physical phone. See the QR troubleshooting steps above.

## Dashboard and device integrations

The Home tab is the dashboard. It summarizes today's tasks, completion, upcoming tasks, active goals and reminders, unread notifications, and monthly task performance. The dashboard links to the Goals, Reminders, Notifications, and Integrations screens.

Contacts are matched on-device only when you ask ORDINA to contact someone. Photos are selected from the device library for task extraction and are not saved as tasks until you confirm. Location permission is requested only when saving a place or when an active arrival reminder needs monitoring; arrival monitoring works while the app is open. Microphone permission is requested when you start voice input. Notification scheduling may require a native development/production build.

Voice recording works in Expo Go while the app is in the foreground, but transcription requires `GEMINI_API_KEY` in `backend-ordina/.env`. Scheduled task notifications require a native development/production build; Android Expo Go does not support them. A development build is also required for Apple sign-in and is more reliable for background location.

## Development build

Expo Go cannot always run microphone, contacts, or calendar. For those:

```bash
npm run android:dev-build
npm run android:run-dev-build
```

Application id: `com.ordina.app`.

Light mode is the default. Change theme in **Profile**.
