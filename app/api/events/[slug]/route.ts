import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { assertSlug } from "@/lib/request";
import { requireGuest, toPublicEvent } from "@/lib/services/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Event details for a guest holding a valid session. */
export const GET = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  assertSlug(slug);
  const { event } = await requireGuest(req, slug);
  return NextResponse.json({ event: toPublicEvent(event) }, { headers: { "Cache-Control": "private, no-store" } });
});
