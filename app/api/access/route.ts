import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/errors";
import { looksLikeAccessCode } from "@/lib/crypto";
import { enforceRateLimit, RATE_RULES } from "@/lib/rate-limit";
import { assertSameOrigin, ipFingerprint, parseJson } from "@/lib/request";
import { attachGuestSession, validateAccessCode } from "@/lib/services/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(1).max(40) });

/** Homepage "Open Event": exchanges a short event code for a guest session and returns the event slug. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(RATE_RULES.accessCode, ipFingerprint(req));
  const { code } = await parseJson(req, Body);
  if (!looksLikeAccessCode(code)) throw new ApiError(400, "invalid_code", "Event codes look like ABCD-2345. Please check and try again.");
  const ctx = await validateAccessCode(code);
  const res = NextResponse.json({ slug: ctx.event.event_slug }, { headers: { "Cache-Control": "no-store" } });
  await attachGuestSession(res, ctx);
  return res;
});
