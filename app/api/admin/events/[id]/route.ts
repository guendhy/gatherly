import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ApiError, route } from "@/lib/errors";
import { parseJson } from "@/lib/request";
import * as repo from "@/lib/repo";
import { emptyStats, loadAdminEvent, UpdateEventSchema } from "@/lib/services/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const stats = (await repo.getEventStats([event.id]))[event.id] ?? emptyStats(event.id);
  return NextResponse.json({ event, stats }, { headers: { "Cache-Control": "no-store" } });
});

/** Update settings, toggle access / uploads / gallery, or end the event (status: "ended"). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const patch = await parseJson(req, UpdateEventSchema);
  if (!Object.keys(patch).length) throw new ApiError(400, "empty_patch", "Nothing to update.");
  const update: repo.EventPatch = { ...patch };
  if ("description" in patch) update.description = patch.description || null;
  if ("cover_image_url" in patch) {
    update.cover_image_url = patch.cover_image_url || null;
    if (patch.cover_image_url) update.cover_drive_file_id = null;
  }
  if (patch.status === "ended" && event.status !== "ended") update.ended_at = new Date().toISOString();
  if (patch.status && patch.status !== "ended") update.ended_at = null;
  const updated = await repo.updateEvent(event.id, update);
  return NextResponse.json({ event: updated });
});
