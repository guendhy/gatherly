import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/errors";
import { getUploadMaxBytes } from "@/lib/env";
import { cleanGuestName } from "@/lib/image";
import { enforceRateLimit, RATE_RULES } from "@/lib/rate-limit";
import { assertSameOrigin, assertSlug, ipFingerprint } from "@/lib/request";
import * as repo from "@/lib/repo";
import { requireGuest } from "@/lib/services/access";
import { decodeCursor, encodeCursor, toGalleryPhoto } from "@/lib/services/photos";
import { assertUploadsOpen, processGuestUpload } from "@/lib/services/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ slug: string }> };

const PAGE_SIZE = 24;

/** Gallery: uploaded photos for this event only, newest first, cursor-paginated. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { slug } = await params;
  assertSlug(slug);
  await enforceRateLimit(RATE_RULES.gallery, ipFingerprint(req));
  const { event } = await requireGuest(req, slug);
  if (!event.gallery_enabled) throw new ApiError(403, "gallery_disabled", "The host has turned off the shared gallery for this event.");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || PAGE_SIZE, 1), 60);
  const rows = await repo.listUploadedPhotos(event.id, limit + 1, decodeCursor(req.nextUrl.searchParams.get("cursor")));
  const page = rows.slice(0, limit);
  return NextResponse.json(
    {
      photos: page.map((r) => toGalleryPhoto(event.event_slug, r)),
      nextCursor: rows.length > limit && page.length ? encodeCursor(page[page.length - 1]!) : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

/** Guest photo upload → validated → Google Drive → recorded in Supabase. */
export const POST = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const { slug } = await params;
  assertSlug(slug);
  const ctx = await requireGuest(req, slug);
  assertUploadsOpen(ctx.event);

  await enforceRateLimit(RATE_RULES.upload, `${ctx.tokenId}:${ipFingerprint(req)}`);
  await enforceRateLimit(RATE_RULES.uploadPerEvent, ctx.event.id);

  const maxBytes = getUploadMaxBytes();
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes + 64 * 1024) {
    throw new ApiError(413, "file_too_large", `That photo is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form", "The upload was interrupted. Please try again.");
  }
  const file = form.get("photo");
  if (!(file instanceof Blob)) throw new ApiError(400, "missing_photo", "Please choose a photo to upload.");
  if (file.size > maxBytes) throw new ApiError(413, "file_too_large", `That photo is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);

  const result = await processGuestUpload({
    event: ctx.event,
    bytes: new Uint8Array(await file.arrayBuffer()),
    guestName: cleanGuestName(form.get("guestName")),
    clientUploadId: String(form.get("clientUploadId") ?? ""),
  });

  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate,
      photo: result.photo.upload_status === "uploaded" && result.recorded ? toGalleryPhoto(ctx.event.event_slug, result.photo) : null,
    },
    { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } },
  );
});
