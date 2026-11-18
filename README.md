# Gatherly — Event Moments

Guests scan a QR code, take photos in their phone's browser, and every photo is uploaded to the host's **Google Drive**. Admins get a dashboard for creating events, QR codes, settings and monitoring.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth) · Google Drive API v3 + OAuth 2.0 · Vercel

```
Create event → Generate QR → Guest scans → Camera → Upload → Google Drive → Gallery
```

---

## Why the old site showed “Open your event QR link”

Version 1 had no events, database or admin area. The whole app was a single client page (`app/page.tsx`). That page read `?key=` from the URL and compared it with an `EVENT_ACCESS_KEY` environment variable. **When the URL had no `?key=`, the page returned the "Open your event QR link" screen**, so the bare domain always showed it. Even with a key, uploads needed a `GOOGLE_REFRESH_TOKEN` copied by hand from the OAuth Playground.

Version 2 replaces that with:

- a real homepage
- per-event QR links (`/e/<slug>?token=…`) checked on the server
- short event codes
- an admin dashboard with an in-app Google Drive connect flow

Old `?key=` links now show a friendly "ask your host for the new QR code" notice.

---

## How it works

| Piece | Where |
|---|---|
| Homepage (Open Event / Admin Login) | `app/page.tsx` |
| Guest welcome, camera and gallery | `app/e/[slug]/…`, `components/guest/*` |
| Admin dashboard, events, QR, settings | `app/admin/…`, `components/admin/*` |
| API routes (all Node.js runtime) | `app/api/**/route.ts` |
| Database access (only file that queries Supabase) | `lib/repo.ts` |
| Upload pipeline, idempotency, reconciliation | `lib/services/uploads.ts` |
| Google Drive client (fetch-based) / OAuth / token storage | `lib/google/*` |
| SQL schema, RLS, rate-limit function | `supabase/migrations/*.sql` |

**Security model**

- **Guests** never log in. The QR link carries a 256-bit token. `POST /api/events/[slug]/session` exchanges it for a signed, httpOnly cookie scoped to that one event (12 h by default).
- Every guest request re-checks the token in the database. Regenerating a QR code, or pausing or ending an event, takes effect immediately.
- Tokens and codes are stored only as peppered HMAC hashes, plus AES-256-GCM ciphertext so admins can re-display the QR code.
- **Admins** sign in with Supabase Auth (email + password). Authorization is checked on the server in every admin page and every `/api/admin/*` route, using the `admins` table. Mutations also require a same-origin request (CSRF protection).
- **Google tokens** are encrypted with `TOKEN_ENCRYPTION_KEY` before they are stored, refreshed automatically, and never sent to the browser.
- The OAuth scope defaults to `drive.file`: Gatherly can only see the folders and files it creates.
- **Photos stay private** in Drive. The gallery streams them through `/api/events/[slug]/photos/[id]/image`, which checks both the guest's session and that the photo belongs to that event. No public Drive links are ever created.
- **Rate limiting** uses a Postgres function (`gatherly_rate_limit`), so the limits are shared across all Vercel instances. It covers event-code guessing, sessions, uploads, the gallery, images and admin login.
- **Uploads:**
  - The browser fixes photo orientation, resizes to 2560 px and recompresses to under 4 MB.
  - The server checks the real file content (magic bytes), the size and the event's upload permission.
  - It records a `pending` row, uploads to Drive, and only reports success once Drive returns a file ID.
  - A client upload ID plus a SHA-256 hash prevent duplicate files.
  - If Drive succeeded but the database write failed, the file is tagged with `appProperties`, and **Sync with Drive** (reconciliation) repairs the record.
  - Photos that fail on the phone are kept in IndexedDB and can be retried.

---

## 1. Supabase setup (about 5 minutes, works in iPhone Safari)

1. Go to [supabase.com](https://supabase.com) → **New project**. Choose a region close to your guests and save the database password somewhere safe.
2. **SQL Editor** → **New query**. Paste the whole of `supabase/migrations/20261118000000_gatherly_schema.sql` and tap **Run**. You should see "Success. No rows returned."
   - On iPhone: open the file on GitHub, tap **Raw**, select all and copy.
3. **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**. This is your admin login. Gatherly never creates admin accounts or passwords for you.
4. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Only the users you add should exist.
5. **Project Settings → API**: copy the **Project URL**, the **anon / publishable key** and the **service_role / secret key**. You'll need them for Vercel. Never share the service_role key.

You become an admin the first time you sign in, provided your email is listed in `ADMIN_EMAILS`. To add an admin manually instead, run this in the SQL Editor:

```sql
insert into public.admins (user_id, role)
select id, 'owner' from auth.users where email = 'you@example.com';
```

## 2. Google Cloud OAuth setup (about 10 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project** (e.g. "Gatherly").
2. **APIs & Services → Library** → search for **Google Drive API** → **Enable**.
3. **Google Auth Platform** (formerly "OAuth consent screen") → **Get started**:
   - App name "Gatherly", your support email, audience **External**, then your contact email.
   - **Data Access → Add or remove scopes**: add `.../auth/drive.file`, `openid` and `email`.
   - **Audience → Test users**: add the Google account whose Drive will store the photos.
4. **Clients → Create client → Web application**:
   - **Authorized JavaScript origins:** `https://YOUR-APP.vercel.app`
   - **Authorized redirect URIs:** `https://YOUR-APP.vercel.app/api/admin/google/callback`. Use your own domain if you add one. The exact value is also shown at **/admin/settings**.
   - For local development, also add `http://localhost:3000/api/admin/google/callback`.
   - Copy the **Client ID** and **Client secret**.
5. **Testing-mode limitation:** while the app's publishing status is **Testing**, Google expires refresh tokens after **7 days**. Gatherly then shows "Google Drive needs to be reconnected" on the dashboard and guests can't upload. You have two options:
   - Reconnect a day or two before each event, or
   - Go to **Audience → Publish app**. Google classifies `drive.file` as a non-sensitive scope, so this normally doesn't need a full security review; follow whatever the console asks for.

`GOOGLE_DRIVE_SCOPE=full` requests full Drive access. Use it only if you need to upload into a folder you created yourself. That scope is restricted and needs Google verification for public use.

## 3. Environment variables

See `.env.example` for the full annotated list. Generate the two secrets with `npm run gen:secrets` (or `openssl rand -base64 32`).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | prod | `https://your-app.vercel.app`, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **server only** |
| `ADMIN_EMAILS` | first run | comma-separated |
| `SESSION_SECRET` | yes | 32+ characters |
| `TOKEN_ENCRYPTION_KEY` | yes | 32 bytes as base64 or hex, or a random passphrase of 40+ characters |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for uploads | |
| `GOOGLE_OAUTH_REDIRECT_URI` | optional | defaults to `${APP_URL}/api/admin/google/callback` |
| `GOOGLE_DRIVE_SCOPE` | optional | `file` (default) or `full` |
| `GOOGLE_DRIVE_FOLDER_ID` | optional | parent folder; only usable with `full` |
| `GOOGLE_REFRESH_TOKEN` | legacy | v1 fallback if no account is connected in-app |
| `UPLOAD_MAX_MB` | optional | default 4; keep at or below 4 on Vercel |
| `GUEST_SESSION_HOURS` | optional | default 12 |

v1 variables you can delete: `EVENT_ACCESS_KEY`, `NEXT_PUBLIC_EVENT_NAME`, `NEXT_PUBLIC_EVENT_DATE`.

## 4. Deploy to Vercel

1. In Vercel, **Add New → Project** → import the GitHub repo. The framework preset is detected as Next.js; no build settings need changing.
2. Before deploying, open **Environment Variables** and add every variable above for **Production** (and Preview if you use it).
3. **Deploy**. Then open `https://YOUR-APP.vercel.app/api/health`. It should return `{"status":"ok","database":"ok",...}`.
4. Whenever you change environment variables, redeploy: **Deployments → ⋯ → Redeploy**.

---

## 📱 iPhone-only guide (GitHub + Supabase + Google + Vercel in Safari)

Tip: in Safari, tap **aA → Request Desktop Website** for consoles that hide menus on mobile (Google Cloud, Vercel).

1. **Update GitHub.** If you have this code on a computer, push it as usual. From iPhone only, use **github.dev** (open your repo and change `.com` to `.dev` in the address bar) or the **Working Copy** app to commit the files, then push to `main`.
2. **Supabase.** Follow section 1 in Safari. Copy the migration SQL from GitHub's **Raw** view.
3. **Google Cloud.** Follow section 2 with Request Desktop Website turned on.
4. **Vercel env vars.** vercel.com → your project → **Settings → Environment Variables → Add**. Paste each value.
   - **Making the two secrets on an iPhone** (don't use an online generator):
     1. Open **Settings → Passwords → +**. Tap the password field and Safari suggests a strong password (like `hupwyx-9Gozva-qimden`).
     2. Do it again, and join the two suggestions to get ~40 characters.
     3. Use one joined pair for `SESSION_SECRET` and a *different* pair for `TOKEN_ENCRYPTION_KEY`. Gatherly accepts any random passphrase of 40+ characters for the encryption key.
   - On a computer, `npm run gen:secrets` does the same.
5. **Deploy / redeploy.** **Deployments** → latest → **⋯ → Redeploy**. Wait for "Ready".
6. **Connect Google Drive.** Open `https://YOUR-APP.vercel.app/admin`, sign in, tap **Settings → Connect Google Drive**, choose the Google account and allow access. You should see "Google Drive connected and verified", and a **Gatherly Events** folder appears in that Drive.
7. **Create an event.** **Events → New event**, fill in the name and date, then tap **Create event & QR code**.
8. **QR code.** Tap **Download PNG** (iOS saves it to Files or Photos via the share sheet), or **Share** to send the link. The event code is also shown.
9. **Test on an iPhone.** Use a second phone if you can, on both cellular and Wi-Fi:
   1. Scan the QR code with the Camera app and open the link.
   2. Tap **Capture Moments → Open camera** and allow camera access.
   3. Take a photo, then **Upload photo**. You should see the "Moment saved!" screen.
10. **Verify in Drive.** Open Google Drive → **Gatherly Events → Gatherly – *Your Event*** and check the photo is there. Then check the guest **Gallery** and the admin event page (photo count and activity log).

---

## Local development

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run gen:secrets
```

```bash
npm run dev
```

Camera access on a phone requires HTTPS, so test camera capture on the Vercel deployment (or an HTTPS tunnel), not on `http://<laptop-ip>:3000`.

## Tests and checks

```bash
npm run check
```

That runs `typecheck → lint → test → build → scan:bundle`.

- `tests/api/flow.test.ts` runs the **real route handlers** end to end. The database is replaced by an in-memory fake that enforces the same unique constraints, and Google Drive by an in-memory fake. It covers:
  - valid, invalid, expired, cross-event and revoked tokens
  - event codes and code-guessing rate limits
  - paused and ended events; uploads and gallery turned off
  - valid uploads landing in the correct folder
  - unsupported (415) and oversized (413) files
  - Drive errors and retry, an expired Google grant (503), and a timeout after Drive actually stored the file (no duplicate)
  - duplicate submissions and concurrent in-flight uploads
  - a database failure after a Drive success, repaired by reconciliation
  - gallery isolation between events
  - admin authorization (401/403), CSRF and strict input validation
  - the health endpoint not leaking configuration
- `tests/unit/*` covers encryption, signed sessions, codes, image content detection, filename safety, the camera, retake and upload state machine, invite parsing, the Drive REST client (multipart format, 401 refresh, 5xx retry, no automatic upload retries) and the OAuth URL.
- `tests/deploy/*`:
  - every API route uses the Node.js runtime
  - no filesystem writes
  - client code never imports server modules
  - `server-only` guards are in place
  - OAuth callback state verification
  - env validation that reports variable names only
- `scripts/scan-bundle.mjs` fails the check if any secret name, or any secret value present in the environment, appears in `.next/static`.

---

## Deliverables status

| # | Deliverable | Status |
|---|---|---|
| 1 | Fixed source (root cause above) | ✅ Implemented and tested |
| 2 | Frontend (home, welcome, camera, confirmation, gallery, admin login, dashboard, create, settings, QR) | ✅ Implemented; layout checked at 375 px. **Live camera capture needs a check on a real iPhone over HTTPS** |
| 3 | Backend API (all routes listed in the brief, plus access, auth, cover, drive-folder, reconcile, logs) | ✅ Implemented and tested against fakes |
| 4 | Supabase migrations, indexes, RLS, rate-limit function | ✅ Written. ⚠️ **Not yet run against a real Supabase project.** You need to run it (section 1) |
| 5 | Admin authentication (Supabase Auth plus `admins` table, no hard-coded passwords) | ✅ Implemented and tested with mocked Supabase Auth. ⚠️ You must create the user |
| 6 | Event creation and management | ✅ Implemented and tested |
| 7 | QR code generator (PNG download, copy, share, regenerate, expiry, event code) | ✅ Implemented; rendering checked |
| 8 | Google Drive OAuth (state, encrypted tokens, refresh, reconnect, revoke) | ✅ Implemented and unit-tested. ⚠️ **Needs your Google Cloud client plus one real connect** |
| 9 | Automatic Drive uploads | ✅ Implemented and tested with a fake Drive. ⚠️ **Not yet verified against real Google Drive** |
| 10 | Shared gallery (pagination, viewer, downloads, admin toggle, isolation) | ✅ Implemented and tested |
| 11 | `.env.example` | ✅ |
| 12 | README | ✅ |
| 13 | Vercel deployment instructions | ✅ Above. ⚠️ Deployment has **not** been performed or verified |
| 14 | Database setup instructions | ✅ Section 1 |
| 15 | Test results | ✅ 68 tests passing; typecheck, lint, production build and bundle scan clean |
| 16 | Production readiness checklist | ✅ Below |

## Production readiness checklist

- [ ] Migration run in Supabase; public sign-ups disabled; admin user created and confirmed
- [ ] All required env vars set in Vercel (Production); `/api/health` returns `ok`
- [ ] Google OAuth client redirect URI exactly matches `/admin/settings`
- [ ] Google Drive connected; "Gatherly Events" folder exists in Drive
- [ ] OAuth app **published**, or you reconnect within 7 days of the event (Testing mode)
- [ ] Test event created; QR scanned from a second phone on cellular data
- [ ] Photo appears in the Drive folder, the guest gallery and the admin dashboard
- [ ] Camera permission denied → "Phone camera" / "From library" fallback works
- [ ] Airplane mode mid-upload → photo kept, retry succeeds, no duplicate in Drive
- [ ] Old QR codes revoked (regenerated) if a link leaked
- [ ] Guests told how photos are used (consent / retention policy for your event)

## Known limitations

- **Upload size:** Vercel functions accept request bodies of about 4.5 MB. Photos are recompressed in the browser to under 4 MB (2560 px long edge), which suits event photos. Full-resolution originals over 4 MB would need direct-to-Drive resumable uploads; that isn't implemented.
- **HEIC from the library:** iOS Safari normally converts HEIC to JPEG on upload. Desktop browsers that can't decode HEIC upload the original if it's under the limit, but those photos may not show in the gallery in browsers without HEIC support.
- **Thumbnails** come from Drive's `thumbnailLink` when it's available; otherwise the full image is streamed.
- **No moderation:** an admin can't hide a single photo from the gallery yet. Delete it in Drive, then run **Sync with Drive**; deleted files aren't removed from the database automatically.
- **One Google account** stores all events. Reconnecting a different account can make older event folders unreachable; set a new folder per event in Settings.
- **Event codes** (8 characters) are rate-limited to 10 tries per 10 minutes per IP. Use the QR link (256-bit token) for anything sensitive.
- Admin password reset is done in the Supabase dashboard (Authentication → Users).
