import { google } from "googleapis";
import { timingSafeEqual } from "node:crypto";

export function getDrive() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error("Google Drive is not configured. See README.md.");
  }
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return { drive: google.drive({ version: "v3", auth }), folderId: GOOGLE_DRIVE_FOLDER_ID };
}

export function hasAccess(key: string | null) {
  const expected = process.env.EVENT_ACCESS_KEY;
  if (!expected || expected.length < 24 || !key) return false;
  const a = Buffer.from(key); const b = Buffer.from(expected);
  // Compare uniformly when lengths are equal; do not expose key to gallery or image responses.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
