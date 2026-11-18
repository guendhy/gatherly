import { NextResponse, type NextRequest } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/admin";
import { safeEqual, verifyPayload } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { getGoogleOAuthConfig, getSessionSecret } from "@/lib/env";
import { saveNewConnection } from "@/lib/google/connection";
import { DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE, emailFromIdToken, exchangeCodeForTokens } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STATE_COOKIE = "gatherly_oauth_state";

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/settings", req.url);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/admin/google", maxAge: 0 });
  return res;
}

/** Google redirects here after consent. Verifies state, stores encrypted tokens, verifies Drive access. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(req, { google: "error", reason: sp.get("error") === "access_denied" ? "denied" : "google_error" });

  const code = sp.get("code");
  const state = sp.get("state");
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return back(req, { google: "error", reason: "not_configured" });
  }
  const saved = verifyPayload<{ s: string; u: string; exp: number }>(req.cookies.get(STATE_COOKIE)?.value, secret);
  if (!code || !state || !saved || !safeEqual(saved.s, state)) return back(req, { google: "error", reason: "state_mismatch" });

  const admin = await getAdminFromRequest(req).catch(() => null);
  if (!admin || admin === "forbidden" || admin.userId !== saved.u) return back(req, { google: "error", reason: "not_admin" });

  try {
    const cfg = getGoogleOAuthConfig(req.nextUrl.origin);
    const tokens = await exchangeCodeForTokens({ code, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri });
    const granted = (tokens.scope ?? "").split(" ");
    if (!granted.includes(DRIVE_FILE_SCOPE) && !granted.includes(DRIVE_FULL_SCOPE)) {
      return back(req, { google: "error", reason: "scope_missing" });
    }
    await saveNewConnection(tokens, emailFromIdToken(tokens.id_token), admin.userId);
    return back(req, { google: "connected" });
  } catch (err) {
    console.error("[gatherly] Google OAuth callback failed", (err as Error).message);
    const reason = err instanceof ApiError ? err.code : "exchange_failed";
    return back(req, { google: "error", reason });
  }
}
