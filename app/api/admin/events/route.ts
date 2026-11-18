import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ApiError, route } from "@/lib/errors";
import { parseJson } from "@/lib/request";
import * as repo from "@/lib/repo";
import { rotateEventAccess } from "@/lib/services/access";
import { CreateEventSchema, listEventsWithStats } from "@/lib/services/admin-events";
import { ensureEventFolder, generateUniqueSlug } from "@/lib/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json({ events: await listEventsWithStats() }, { headers: { "Cache-Control": "no-store" } });
});

/** Creates an event, its QR access token + code, and (if Drive is connected) its Drive folder. */
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const input = await parseJson(req, CreateEventSchema);
  const slug = await generateUniqueSlug(input.event_name);
  const created = await repo.insertEvent({
    event_name: input.event_name,
    event_slug: slug,
    description: input.description || null,
    event_date: input.event_date ?? null,
    cover_image_url: input.cover_image_url || null,
    status: input.status,
    upload_enabled: input.upload_enabled,
    gallery_enabled: input.gallery_enabled,
    created_by: admin.userId,
  });
  if (created === "slug_taken") throw new ApiError(409, "slug_taken", "Please try again.");

  const access = await rotateEventAccess(created, null, req.nextUrl.origin);

  // Best effort: the folder is also created lazily on first upload.
  let driveFolder: "created" | "pending" = "pending";
  try {
    await ensureEventFolder(created);
    driveFolder = "created";
  } catch (err) {
    console.warn("[gatherly] event folder not created yet", (err as Error).message);
  }

  return NextResponse.json({ event: created, access, driveFolder }, { status: 201 });
});
