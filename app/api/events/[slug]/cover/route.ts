import { ApiError, route } from "@/lib/errors";
import { getAdminFromRequest } from "@/lib/auth/admin";
import { assertSlug } from "@/lib/request";
import { loadEventOr404, requireGuest } from "@/lib/services/access";
import { streamDriveImage } from "@/lib/services/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Event cover image (stored privately in Drive). Visible to guests with a session and to admins. */
export const GET = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  assertSlug(slug);
  let event;
  try {
    event = (await requireGuest(req, slug)).event;
  } catch (err) {
    const admin = await getAdminFromRequest(req).catch(() => null);
    if (!admin || admin === "forbidden") throw err;
    event = await loadEventOr404(slug);
  }
  if (!event.cover_drive_file_id) throw new ApiError(404, "not_found", "No cover image.");
  return streamDriveImage({ google_drive_file_id: event.cover_drive_file_id, mime_type: "image/jpeg", file_name: "cover.jpg" }, { size: "full" });
});
