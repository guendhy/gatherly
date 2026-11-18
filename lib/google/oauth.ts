import "server-only";
import type { DriveScopeMode } from "@/lib/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive";

export function driveScopes(mode: DriveScopeMode): string[] {
  return ["openid", "email", mode === "full" ? DRIVE_FULL_SCOPE : DRIVE_FILE_SCOPE];
}

export class GoogleOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export type GoogleTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  token_type?: string;
};

export function buildGoogleAuthUrl(opts: { clientId: string; redirectUri: string; state: string; scopes: string[]; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    access_type: "offline", // we need a refresh token for uploads while the host is away
    prompt: "consent", // forces Google to return a refresh token on reconnect
    include_granted_scopes: "true",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<GoogleTokens> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new GoogleOAuthError(json.error ?? `http_${res.status}`, json.error_description ?? "Google token request failed");
  }
  return json as GoogleTokens;
}

export function exchangeCodeForTokens(opts: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  });
}

export function refreshGoogleAccessToken(opts: { refreshToken: string; clientId: string; clientSecret: string }) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
}

/**
 * Reads the email claim from an ID token received *directly* from Google's
 * token endpoint over TLS (OIDC Core §3.1.3.7 allows skipping signature
 * validation in that case). Used only to label the connected account.
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
