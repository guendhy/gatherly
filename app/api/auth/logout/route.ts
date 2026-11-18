import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/request";
import { createRouteAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const res = NextResponse.json({ ok: true });
  await createRouteAuthClient(req, res).auth.signOut();
  return res;
});
