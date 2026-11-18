import "server-only";
import { createHash } from "node:crypto";
import { ConfigError } from "./errors";

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getSupabaseConfig() {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = read("SUPABASE_SERVICE_ROLE_KEY") ?? read("SUPABASE_SECRET_KEY");
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) throw new ConfigError(missing);
  return { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey! };
}

export function getSessionSecret(): string {
  const secret = read("SESSION_SECRET");
  if (!secret || secret.length < 32) throw new ConfigError(["SESSION_SECRET"]);
  return secret;
}

/**
 * Accepts 32 bytes as hex (64 chars) or base64 (44 chars), or — so it can be
 * created on a phone — any random passphrase of 40+ characters, which is
 * stretched to 32 bytes with SHA-256.
 */
export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, "base64");
  if (raw.length >= 40) return createHash("sha256").update(raw, "utf8").digest();
  return null;
}

export function getEncryptionKey(): Buffer {
  const key = parseEncryptionKey(read("TOKEN_ENCRYPTION_KEY"));
  if (!key) throw new ConfigError(["TOKEN_ENCRYPTION_KEY"]);
  return key;
}

export type DriveScopeMode = "file" | "full";

export function getGoogleOAuthConfig(fallbackOrigin?: string) {
  const clientId = read("GOOGLE_CLIENT_ID");
  const clientSecret = read("GOOGLE_CLIENT_SECRET");
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) throw new ConfigError(missing, "Google Drive is not configured yet.");
  const base = getAppUrl(fallbackOrigin);
  const redirectUri = read("GOOGLE_OAUTH_REDIRECT_URI") ?? `${base}/api/admin/google/callback`;
  const scopeMode: DriveScopeMode = read("GOOGLE_DRIVE_SCOPE")?.toLowerCase() === "full" ? "full" : "file";
  return { clientId: clientId!, clientSecret: clientSecret!, redirectUri, scopeMode };
}

export function getLegacyDriveEnv() {
  return { refreshToken: read("GOOGLE_REFRESH_TOKEN"), folderId: read("GOOGLE_DRIVE_FOLDER_ID") };
}

export function getConfiguredParentFolderId(): string | undefined {
  return read("GOOGLE_DRIVE_FOLDER_ID");
}

/** Public origin used for QR links. Prefers NEXT_PUBLIC_APP_URL, then Vercel's production URL, then the request origin. */
export function getAppUrl(fallbackOrigin?: string): string {
  const explicit = read("NEXT_PUBLIC_APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = read("VERCEL_PROJECT_PRODUCTION_URL") ?? read("VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  if (fallbackOrigin) return fallbackOrigin.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export function getUploadMaxBytes(): number {
  const mb = Number(read("UPLOAD_MAX_MB") ?? "4");
  const safe = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 25) : 4;
  return Math.floor(safe * 1024 * 1024);
}

export function getGuestSessionSeconds(): number {
  const hours = Number(read("GUEST_SESSION_HOURS") ?? "12");
  const safe = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 14) : 12;
  return Math.floor(safe * 3600);
}

export function getAdminEmails(): string[] {
  return (read("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isProduction = () => process.env.NODE_ENV === "production";

export type ConfigCheck = { key: string; label: string; ok: boolean; vars: string[]; requiredFor: string };

/** Which parts of the setup are complete. Reports variable names only — never values. */
export function getConfigChecks(): ConfigCheck[] {
  const has = (n: string) => Boolean(read(n));
  return [
    {
      key: "supabase",
      label: "Supabase database",
      ok: has("NEXT_PUBLIC_SUPABASE_URL") && (has("NEXT_PUBLIC_SUPABASE_ANON_KEY") || has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) && (has("SUPABASE_SERVICE_ROLE_KEY") || has("SUPABASE_SECRET_KEY")),
      vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      requiredFor: "everything",
    },
    { key: "session", label: "Session secret", ok: (read("SESSION_SECRET")?.length ?? 0) >= 32, vars: ["SESSION_SECRET"], requiredFor: "guest access and admin Google connect" },
    { key: "encryption", label: "Token encryption key", ok: parseEncryptionKey(read("TOKEN_ENCRYPTION_KEY")) !== null, vars: ["TOKEN_ENCRYPTION_KEY"], requiredFor: "QR codes and Google Drive" },
    { key: "google", label: "Google OAuth client", ok: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET"), vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], requiredFor: "photo uploads" },
    { key: "appUrl", label: "Public app URL", ok: has("NEXT_PUBLIC_APP_URL") || has("VERCEL_PROJECT_PRODUCTION_URL"), vars: ["NEXT_PUBLIC_APP_URL"], requiredFor: "correct QR links" },
    { key: "admins", label: "Admin email allow-list", ok: getAdminEmails().length > 0, vars: ["ADMIN_EMAILS"], requiredFor: "first admin sign-in (or add a row to the admins table)" },
  ];
}

export function isSupabaseConfigured(): boolean {
  return getConfigChecks()[0].ok;
}
