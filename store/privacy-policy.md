# ORDINA AI Privacy Policy (DRAFT)

> **Draft. Fill in every `TODO` and review it before publishing.** It describes what the code
> actually does in the ORDINA AI Android app (Tasks + ORDINA AI build). Have it checked if you
> need legal certainty. The policy must be hosted at a public URL (see "Hosting" at the end).

**Effective date:** TODO (date you publish it)
**App:** ORDINA AI (Android, package `com.ordina.app`)
**Developer:** TODO (your name or business name)
**Contact:** TODO (email address for privacy questions and deletion requests)

## 1. What ORDINA AI does

ORDINA AI helps you plan your day. You create tasks yourself, or describe your day in plain language and ORDINA AI proposes a plan that you review, edit and confirm before anything is saved.

## 2. Data we collect and store

**Your tasks live on your phone.** ORDINA AI works without an account: tasks, categories, reminders and settings are stored in the app's database on your phone and are not sent to us, except as described below.

| Data | Why | Where it is stored |
| --- | --- | --- |
| **Tasks, categories, reminders, settings** | The core app features | **On your phone.** Copied to our database only if you create an account (server backup and sync) |
| **Account (optional):** name, email address, password (stored only as a one-way argon2 hash, never in plain text) | Signing in, server backup, using your tasks on another phone | Our database (Neon, PostgreSQL, USA – Ohio) |
| **Server backup (only with an account):** a copy of your tasks and categories, including deleted items marked as deleted | Restoring your tasks on a new phone and keeping your phones in sync | Our database |
| **Sign-in sessions (only with an account):** a hashed refresh token per signed-in phone | Keeping you signed in | Our database |
| **Password-reset codes:** a hashed 6-digit code, valid 15 minutes | Resetting a forgotten password | Our database; the code is emailed to you (Resend) |
| **Device identifier (without an account):** a random ID created by the app | Using ORDINA AI without an account, and keeping your planning preferences for that phone | Our database |
| **ORDINA AI requests:** what you type or say to ORDINA AI, its short replies, and the times of your tasks for the coming week (no titles) plus your recent task titles and times, to learn your habits | Planning the request | Our database |
| **Planning preferences:** a small profile learned from your tasks and from the AI suggestions you correct | Making future plans match your habits | Our database |
| **Voice recordings** (only if you tap the microphone) | Turning speech into text | Sent to our server and on to Google Gemini for transcription. **Not stored** by ORDINA |

**Backup files** you export are created on your phone and go only where you send them (for example Google Drive or email).

**Notifications:** reminders are scheduled on your phone. ORDINA asks for notification permission only when you first turn a reminder on.

On your phone, the app keeps your sign-in session and an optional app passcode in the device's secure storage.

We **do not** collect your location, contacts, photos or calendar in this version of the app. We do not use advertising or analytics SDKs, and we do not sell your data.

## 3. AI processing by Google Gemini

ORDINA AI uses the **Google Gemini API** to understand your requests. When you use ORDINA AI, our server (not your phone) sends Google:

- the text of your request, your answers to ORDINA AI's questions, and the titles and times of tasks in the plan you are reviewing;
- today's date, your local time and time zone;
- the start and end **times** of your other tasks that day (not their titles), so the plan avoids clashes;
- a short summary of your planning habits (task types and usual times, no task titles);
- voice recordings you choose to make, for transcription.

**ORDINA AI currently uses the free tier of the Gemini API.** Under Google's terms for the free tier (Unpaid Services), **Google may use the content sent to the service and the generated responses to provide, improve and develop Google products and services, and human reviewers may read, annotate and process that content.** Google states that it disconnects this data from the Google account and API key before reviewers see it. Google's terms also advise against submitting sensitive, confidential or personal information to the free tier, so **please do not put sensitive personal information (such as health, financial or identity details) in tasks or AI requests.** See Google's Gemini API terms: <https://ai.google.dev/gemini-api/terms>.

(If ORDINA AI moves to Google's paid tier, Google does not use prompts or responses to improve its products. This policy will be updated if that changes.)

## 4. Service providers

| Provider | Role | Location |
| --- | --- | --- |
| Render | Hosts the ORDINA AI server | USA (Ohio) |
| Neon | Hosts the PostgreSQL database | USA (Ohio, AWS us-east-2) |
| Google (Gemini API) | AI processing as described in section 3 | Google infrastructure |
| Resend | Sends password-reset emails (your email address and the code) | USA |

TODO: confirm the Render region shown on your service page (the blueprint uses Ohio).

## 5. Security

All traffic between the app and our server uses HTTPS (encrypted in transit). Passwords are stored only as salted argon2 hashes. Server logs record only the request type, address, status and timing. They do not record your tasks, AI requests or passwords.

## 6. How long we keep data

Tasks on your phone stay until you delete them or uninstall the app. With an account, we keep your server backup, AI conversation and planning preferences until you delete your account. A deleted task is kept in the backup only as a "deleted" marker so your other phones remove it too. Data processed by Google through the Gemini free tier is kept according to Google's terms.

## 7. Deleting your account and data

You can delete your account and **all** associated server data (server backup of tasks and categories, AI conversation, planning preferences, sessions) at any time. Tasks on your phone are kept unless you delete them.

- **In the app:** Settings → Account → Delete account.
- **On the web:** TODO `https://<your-render-url>/account/delete` (sign in with your email and password to confirm).
- **By email:** TODO contact email.

Deletion is permanent and takes effect immediately on our servers.

## 8. Children

ORDINA AI is not directed at children under 13 (TODO: adjust to your target audience and local law), and we do not knowingly collect their data.

## 9. Changes

We will update this policy when the app's data use changes and change the effective date above.

## 10. Contact

Questions or requests: TODO contact email.

---

### Hosting this policy for free (GitHub Pages)

1. In the GitHub repo **Annithah/ordina**, go to **Settings → Pages**. Set **Source** to "Deploy from a branch", choose branch `frontend-ordina-001` and folder `/ (root)`, and save.
2. After a minute the policy is available at `https://annithah.github.io/ordina/store/privacy-policy`. GitHub renders the Markdown.
3. Use that URL in the app listing and Play Console later.
