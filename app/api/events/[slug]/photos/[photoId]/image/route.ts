import { ApiError, route } from "@/lib/errors";
import { enforceRateLimit, RATE_RULES } from "@/lib/rate-limit";
import { assertSlug, assertUuid, ipFingerprint } from "@/lib/request";
import * as repo from "@/lib/repo";
import { requireGuest } from "@/lib/services/access";
import { streamDriveImage } from "@/lib/services/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Serves one private photo. The photo must belong to the event the guest has a session for. */
export const GET = route<{ params: Promise<{ slug: string; photoId: string }> }>(async (req, { params }) => {
  const { slug, photoId } = await params;
  assertSlug(slug);
  assertUuid(photoId, "photo");
  await enforceRateLimit(RATE_RULES.image, ipFingerprint(req));
  const { event } = await requireGuest(req, slug);
  if (!event.gallery_enabled) throw new ApiError(403, "gallery_disabled", "The shared gallery is turned off for this event.");
  const photo = await repo.getEventPhoto(event.id, photoId);
  if (!photo || photo.upload_status !== "uploaded") throw new ApiError(404, "not_found", "Photo not found.");
  const sp = req.nextUrl.searchParams;
  return streamDriveImage(photo, { size: sp.get("size") === "thumb" ? "thumb" : "full", download: sp.get("download") === "1" });
});
