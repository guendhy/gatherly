import "server-only";
import { ApiError } from "@/lib/errors";
import { getDrive } from "@/lib/google/connection";
import { DriveAuthError } from "@/lib/google/drive";
import { randomToken } from "@/lib/crypto";
import * as repo from "@/lib/repo";
import { eventSlug } from "@/lib/slug";
import type { EventRow } from "@/lib/types";

export function folderNameFor(event: Pick<EventRow, "event_name" | "event_date">): string {
  return `Gatherly – ${event.event_name}${event.event_date ? ` (${event.event_date})` : ""}`.slice(0, 200);
}

export function storageError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DriveAuthError) {
    return new ApiError(503, "storage_reauth_required", "Photo storage needs attention from the event host. Please try again later.");
  }
  return new ApiError(502, "storage_failed", "We couldn't reach the event photo album. Please try again.");
}

/**
 * Returns the event's Drive folder, creating it under the host's Gatherly
 * folder on first use. Safe under concurrent uploads: only one folder wins.
 */
export async function ensureEventFolder(event: EventRow): Promise<string> {
  if (event.google_drive_folder_id) return event.google_drive_folder_id;
  const { drive, rootFolderId } = await getDrive();
  const folder = await drive.createFolder(folderNameFor(event), rootFolderId);
  const won = await repo.setEventFolderIfEmpty(event.id, folder.id);
  if (won) {
    event.google_drive_folder_id = folder.id;
    return folder.id;
  }
  await drive.deleteFile(folder.id).catch(() => undefined);
  const fresh = await repo.getEventById(event.id);
  if (!fresh?.google_drive_folder_id) throw new ApiError(500, "folder_race", "Could not prepare the event folder. Please retry.");
  event.google_drive_folder_id = fresh.google_drive_folder_id;
  return fresh.google_drive_folder_id;
}

/** Confirms the connected Google account can add files to `folderId`. */
export async function verifyFolderWritable(folderId: string): Promise<{ id: string; name: string | null }> {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(folderId)) throw new ApiError(400, "invalid_folder", "That doesn't look like a Google Drive folder ID.");
  const { drive } = await getDrive();
  const file = await drive.getFile(folderId, "id,name,mimeType,trashed,capabilities(canAddChildren)");
  if (!file || file.trashed) {
    throw new ApiError(
      400,
      "folder_not_accessible",
      "Gatherly can't see that folder. With the default Drive permission Gatherly can only use folders it created — leave the field blank to let it create one, or set GOOGLE_DRIVE_SCOPE=full and reconnect Google Drive.",
    );
  }
  if (file.mimeType !== "application/vnd.google-apps.folder") throw new ApiError(400, "not_a_folder", "That Drive ID is a file, not a folder.");
  if (!file.capabilities?.canAddChildren) throw new ApiError(400, "folder_read_only", "The connected Google account can't add files to that folder.");
  return { id: file.id, name: file.name ?? null };
}

export async function generateUniqueSlug(name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = eventSlug(name, () => randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5).padEnd(5, "x"));
    if (!(await repo.slugExists(slug))) return slug;
  }
  throw new ApiError(500, "slug_failed", "Could not generate a unique event link. Please try again.");
}
