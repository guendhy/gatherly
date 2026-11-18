import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ApiError, route } from "@/lib/errors";
import { getUploadMaxBytes } from "@/lib/env";
import { getDrive } from "@/lib/google/connection";
import { validateImageBytes } from "@/lib/image";
import * as repo from "@/lib/repo";
import { loadAdminEvent } from "@/lib/services/admin-events";
import { ensureEventFolder, storageError } from "@/lib/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Uploads a cover image into the event's private Drive folder. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const form = await req.formData().catch(() => null);
  const file = form?.get("cover");
  if (!(file instanceof Blob)) throw new ApiError(400, "missing_file", "Choose an image.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = validateImageBytes(bytes, getUploadMaxBytes());
  try {
    const folderId = await ensureEventFolder(event);
    const { drive } = await getDrive();
    const uploaded = await drive.uploadFile({
      name: `_cover_${Date.now()}.${kind.ext}`,
      mimeType: kind.mime,
      bytes,
      parentId: folderId,
      description: "Gatherly event cover image",
      appProperties: { gatherlyCoverFor: event.id },
    });
    const updated = await repo.updateEvent(event.id, { cover_drive_file_id: uploaded.id, cover_image_url: null });
    return NextResponse.json({ event: updated });
  } catch (err) {
    throw storageError(err);
  }
});

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const updated = await repo.updateEvent(event.id, { cover_drive_file_id: null, cover_image_url: null });
  return NextResponse.json({ event: updated });
});
