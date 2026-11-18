import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/errors";
import { enforceRateLimit, RATE_RULES } from "@/lib/rate-limit";
import { assertSameOrigin, ipFingerprint, parseJson } from "@/lib/request";
import { createRouteAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

/** Admin sign-in via Supabase Auth. Session cookies are httpOnly and set server-side. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(RATE_RULES.login, ipFingerprint(req));
  const { email, password } = await parseJson(req, Body);
  const res = NextResponse.json({ ok: true });
  const supabase = createRouteAuthClient(req, res);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const unconfirmed = /confirm/i.test(error.message);
    throw new ApiError(401, unconfirmed ? "email_not_confirmed" : "invalid_credentials", unconfirmed ? "Please confirm your email address first." : "Incorrect email or password.");
  }
  return res;
});
