# Gatherly — Event QR Camera and Google Drive Gallery

A mobile-first Next.js website for event guests. They scan one QR code with the built-in iPhone Camera app, open a browser, capture a photo, and it automatically uploads to **your** Google Drive folder. Everyone with the event QR link can view the shared gallery. No Google login required for guests.

## Features

- Beautiful iPhone-responsive Capture / Gallery / QR Share pages
- Rear-facing camera by default, switch to selfie camera
- iOS camera or photo library fallback; automatic upload after capture/selection
- Google Drive folder stores full-resolution JPEGs and other supported image files
- Gallery lists photos directly from that Google Drive folder
- No accounts for guests, optional guest name metadata
- Secret, unguessable event URL key (anyone with the QR can access and upload)

## Local setup

Requirements: Node.js 20+ and a Google account. Run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/?key=YOUR_EVENT_ACCESS_KEY` in a desktop browser. On an **iPhone**, camera access requires a deployed **HTTPS** URL (localhost on your computer will not work as a camera URL on your phone).

## Connect your Google Drive

1. In Google Drive, create an empty folder (e.g. `Nelfa Birthday Moments`). Copy its folder ID from `https://drive.google.com/drive/u/0/folders/FOLDER_ID` into `GOOGLE_DRIVE_FOLDER_ID`.
2. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project, **enable Google Drive API**, and configure the OAuth consent screen (External or Internal depending on your workspace). For an External app in Testing, add **your own Google account** as a test user. Note: Testing-mode refresh tokens can expire after 7 days; for an ongoing event service publish the consent app appropriately, observing Google's verification requirements.
3. Create an **OAuth 2.0 Client ID** (type: Web application). Add `https://developers.google.com/oauthplayground` as an authorized redirect URI. Copy the client ID and secret to `.env.local`.
4. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). Click the gear icon and enable **Use your own OAuth credentials**, enter your client ID and secret. Enable offline access. In Step 1 enter scope `https://www.googleapis.com/auth/drive` and authorize using the **same Google account as the Drive folder owner** (or an account with write access). In Step 2 exchange the authorization code for tokens and copy the **refresh token** into `GOOGLE_REFRESH_TOKEN`. Google may require OAuth verification before public production usage. The full Drive scope grants broad account access; restrict the OAuth credentials to this server only. Google may not return a new refresh token if you've already consented; revoke and reauthorize if needed.
5. Set `EVENT_ACCESS_KEY` to a unique secret at least 24 characters long (prefer 48+ random characters; run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Set the event name and date.
6. Restart the server. Test a photo upload and confirm it appears in the Google Drive folder and shared gallery.

**Important:** Keep the folder **private**. The app reads Drive photos server-side with your OAuth credentials. Never put client secret/refresh token in a `NEXT_PUBLIC_` variable or anywhere client-side.

## Deploy to a publicly accessible HTTPS URL

Recommended: **Vercel**. Push this folder into a private GitHub repository. On [vercel.com](https://vercel.com/), import the repository, select Next.js, and add the six environment variables from `.env.local` in Project Settings > Environment Variables. Deploy and copy your HTTPS domain.

Your event URL will be:

`https://YOUR-APP.vercel.app/?key=YOUR_EVENT_ACCESS_KEY`

Open that link on an iPhone. Tap **QR / Share** and display the QR code at the event. Guests can scan it with their iPhone Camera app, tap **Open camera**, snap a photo, and it will upload automatically. Guests can also use **Take / Choose Photo** when browser camera permissions are blocked.

## Privacy and production cautions

- **Anyone with the event URL/QR key** can submit and see photos. Keep this link within the intended guest group. Do not use it for confidential content. The app is a shared guest photo booth, not a high-security private photo vault.
- The included upload limit is **12 MB per photo**. Files above the host's serverless request-body limit can be rejected before the application sees them; Vercel serverless functions may impose a ~4.5 MB request-body limit depending on the deployment/product plan. Camera snapshots are JPEG-compressed, but photos picked from the iPhone library can exceed this. For large event-volume production, implement direct resumable uploads via a storage service or Google Drive protocol (server-controlled) and add image resizing on the client.
- No rate limiting, CAPTCHA, moderation, malware scanning, administrative removal, or guest consent workflow is included. Add them before publicly promoting a large event.
- Images can contain sensitive information; obtain attendee consent and set a retention/deletion policy. Guests can download photos they can view. For privacy, do not put this event in a publicly indexed page.
- Google Drive may rate-limit heavy traffic and the app fetches images through the server. This starter is intended for smaller personal events, not tens of thousands of guests.
- The gallery shows the latest **100** images (pagination could be added).

## Test checklist

- [ ] App builds with `npm run build`
- [ ] Missing or wrong event key is rejected
- [ ] QR link opens from a second phone
- [ ] Safari allows rear camera on HTTPS
- [ ] Flip camera works
- [ ] Capture leads to a success notice and new Drive photo
- [ ] Photo picker uploads on iPhone
- [ ] The uploaded photo appears in Gallery after refresh
- [ ] Gallery images open full screen
- [ ] Photos remain private in Drive, with credentials on the server
- [ ] Trial completed using an iPhone on cellular as well as Wi-Fi
# gatherly
