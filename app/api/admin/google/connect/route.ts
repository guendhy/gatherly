import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { randomToken, signPayload } from "@/lib/crypto";
import { errorResponse } from "@/lib/errors";
import { getGoogleOAuthConfig, getSessionSecret, isProduction } from "@/lib/env";
import { buildGoogleAuthUrl, driveScopes } from "@/lib/google/oauth";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "gatherly_oauth_state";

/** Starts the Google OAuth flow for the signed-in admin. */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const cfg = getGoogleOAuthConfig(req.nextUrl.origin);
    const state = randomToken(24);
    const res = NextResponse.redirect(
      buildGoogleAuthUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, scopes: driveScopes(cfg.scopeMode), loginHint: admin.email ?? undefined }),
    );
    // State is bound to this admin and expires in 10 minutes.
    res.cookies.set(OAUTH_STATE_COOKIE, signPayload({ s: state, u: admin.userId, exp: Math.floor(Date.now() / 1000) + 600 }, getSessionSecret()), {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: "/api/admin/google",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return NextResponse.redirect(new URL("/admin/login", req.url));
    return errorResponse(err);
  }
}
