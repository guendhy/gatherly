import "server-only";
import { ApiError } from "@/lib/errors";
import { getDrive } from "@/lib/google/connection";
import type { GalleryPhoto, PhotoRow } from "@/lib/types";
import type { PhotoCursor } from "@/lib/repo";
import { storageError } from "./events";

export function encodeCursor(row: Pick<PhotoRow, "uploaded_at" | "id">): string {
  return Buffer.from(`${row.uploaded_at}|${row.id}`).toString("base64url");
}

export function decodeCursor(raw: string | null): PhotoCursor | null {
  if (!raw) return null;
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export function toGalleryPhoto(slug: string, row: PhotoRow): GalleryPhoto {
  const base = `/api/events/${slug}/photos/${row.id}/image`;
  return {
    id: row.id,
    guestName: row.guest_name,
    uploadedAt: row.uploaded_at ?? row.created_at,
    thumbUrl: `${base}?size=thumb`,
    fullUrl: base,
    downloadUrl: `${base}?download=1`,
  };
}

/**
 * Streams a private Drive file through the server. Drive links are never
 * exposed; the caller must already have authorised access to `row`.
 */
export async function streamDriveImage(
  row: Pick<PhotoRow, "google_drive_file_id" | "mime_type" | "file_name">,
  opts: { size?: "thumb" | "full"; download?: boolean },
): Promise<Response> {
  if (!row.google_drive_file_id) throw new ApiError(404, "not_found", "Photo not found.");
  try {
    const { drive } = await getDrive();
    let upstream: Response | null = null;
    if (opts.size === "thumb") upstream = await drive.downloadThumbnail(row.google_drive_file_id, 640);
    if (!upstream) upstream = await drive.downloadMedia(row.google_drive_file_id);
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type")?.startsWith("image/") ? upstream.headers.get("content-type")! : row.mime_type,
      // File ids are immutable; cache in the guest's browser only (never shared caches).
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    if (opts.download) headers.set("Content-Disposition", `attachment; filename="${row.file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[gatherly] image stream failed", (err as Error).message);
    throw storageError(err);
  }
}
