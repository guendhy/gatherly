import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { route } from "@/lib/errors";
import * as repo from "@/lib/repo";
import { loadAdminEvent } from "@/lib/services/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full photo metadata (all statuses) for the admin. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const photos = await repo.listAllPhotos(event.id, 500);
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
});
