import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/errors";
import { enforceRateLimit, RATE_RULES } from "@/lib/rate-limit";
import { assertSameOrigin, assertSlug, ipFingerprint, parseJson } from "@/lib/request";
import { attachGuestSession, toPublicEvent, validateLinkToken } from "@/lib/services/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(1).max(200) });

/** Exchanges the QR-link token for a short-lived, httpOnly guest session cookie. */
export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const { slug } = await params;
  assertSlug(slug);
  await enforceRateLimit(RATE_RULES.session, ipFingerprint(req));
  const { token } = await parseJson(req, Body);
  const ctx = await validateLinkToken(slug, token);
  const res = NextResponse.json({ event: toPublicEvent(ctx.event) }, { headers: { "Cache-Control": "no-store" } });
  const expiresAt = await attachGuestSession(res, ctx);
  res.headers.set("X-Session-Expires", expiresAt.toISOString());
  return res;
});
