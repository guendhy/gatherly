import { requireAdmin } from "@/lib/auth/admin";
import { ApiError, route } from "@/lib/errors";
import { assertUuid } from "@/lib/request";
import * as repo from "@/lib/repo";
import { streamDriveImage } from "@/lib/services/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Admin preview of any uploaded photo (independent of the guest gallery toggle). */
export const GET = route<{ params: Promise<{ photoId: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const { photoId } = await params;
  assertUuid(photoId, "photo");
  const photo = await repo.getPhotoById(photoId);
  if (!photo?.google_drive_file_id) throw new ApiError(404, "not_found", "Photo not found.");
  const sp = req.nextUrl.searchParams;
  return streamDriveImage(photo, { size: sp.get("size") === "thumb" ? "thumb" : "full", download: sp.get("download") === "1" });
});
