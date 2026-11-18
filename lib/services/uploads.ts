import "server-only";
import { ApiError } from "@/lib/errors";
import { sha256Hex } from "@/lib/crypto";
import { getUploadMaxBytes } from "@/lib/env";
import { getDrive } from "@/lib/google/connection";
import { DriveAuthError, DriveError, type DriveClient, type DriveFile } from "@/lib/google/drive";
import { buildPhotoFileName, validateImageBytes } from "@/lib/image";
import * as repo from "@/lib/repo";
import type { EventRow, PhotoRow } from "@/lib/types";
import { ensureEventFolder, storageError } from "./events";

export const CLIENT_UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** A pending row younger than this is assumed to still be uploading (another request in flight). */
const IN_FLIGHT_MS = 90_000;

export type UploadInput = {
  event: EventRow;
  bytes: Uint8Array;
  guestName: string | null;
  clientUploadId: string;
};

export type UploadResult = {
  photo: PhotoRow;
  /** true when this exact submission (or identical file) was already stored — no new Drive file created. */
  duplicate: boolean;
  /** false when Drive confirmed the file but the database update failed; reconciliation will fix it. */
  recorded: boolean;
};

async function log(eventId: string, photoId: string | null, status: string, error?: string) {
  await repo.insertUploadLog({ event_id: eventId, photo_id: photoId, status, error_message: error?.slice(0, 500) ?? null });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw last;
}

export function assertUploadsOpen(event: EventRow) {
  if (event.status !== "active") throw new ApiError(403, "event_closed", "This event is no longer accepting photos.");
  if (!event.upload_enabled) throw new ApiError(403, "uploads_disabled", "Photo uploads are currently turned off for this event.");
}

/**
 * Upload pipeline:
 *  validate → idempotency checks → pending DB row → Drive upload
 *  (with "did a previous attempt already land?" check) → mark uploaded.
 * Success is only reported once Google Drive has returned a file id.
 */
export async function processGuestUpload(input: UploadInput): Promise<UploadResult> {
  const { event, bytes, guestName, clientUploadId } = input;
  assertUploadsOpen(event);
  if (!CLIENT_UPLOAD_ID_RE.test(clientUploadId)) throw new ApiError(400, "invalid_upload_id", "Invalid upload id.");

  const kind = validateImageBytes(bytes, getUploadMaxBytes());
  const sha = sha256Hex(bytes);

  // 1) Same submission retried (double tap, network retry, page restore)?
  const existing = await repo.getPhotoByClientId(event.id, clientUploadId);
  if (existing?.upload_status === "uploaded") return { photo: existing, duplicate: true, recorded: true };
  if (existing?.upload_status === "pending" && Date.now() - new Date(existing.updated_at).getTime() < IN_FLIGHT_MS) {
    throw new ApiError(409, "upload_in_progress", "This photo is still uploading. Please wait a moment.");
  }

  // 2) Identical file already in this event's album?
  const sameBytes = await repo.getUploadedPhotoBySha(event.id, sha);
  if (sameBytes) {
    await log(event.id, sameBytes.id, "duplicate_skipped");
    return { photo: sameBytes, duplicate: true, recorded: true };
  }

  // 3) Record intent before touching Drive, so nothing is ever uploaded without a trace.
  let photo: PhotoRow;
  const photoId = existing?.id ?? crypto.randomUUID();
  const fileName = buildPhotoFileName(event.event_slug, guestName, photoId, kind.ext);
  if (existing) {
    const retried = await repo.updatePhoto(existing.id, { upload_status: "pending", error_message: null, sha256: sha, file_size: bytes.length, mime_type: kind.mime, guest_name: guestName, file_name: fileName });
    if (!retried) throw new ApiError(500, "db_error", "Could not prepare your upload. Please try again.");
    photo = retried;
  } else {
    const inserted = await repo.insertPendingPhoto({
      id: photoId,
      event_id: event.id,
      guest_name: guestName,
      file_name: fileName,
      mime_type: kind.mime,
      file_size: bytes.length,
      sha256: sha,
      client_upload_id: clientUploadId,
    });
    if (inserted === "conflict") throw new ApiError(409, "upload_in_progress", "This photo is already being uploaded.");
    photo = inserted;
  }

  // 4) Upload to Google Drive.
  let file: DriveFile;
  try {
    const folderId = await ensureEventFolder(event);
    const { drive } = await getDrive();
    file = await uploadOnce(drive, { photo, event, folderId, fileName, mime: kind.mime, bytes, guestName });
  } catch (err) {
    const message = err instanceof DriveError ? `${err.reason}: ${err.message}` : (err as Error).message;
    await repo.updatePhoto(photo.id, { upload_status: "failed", error_message: message.slice(0, 500) }).catch(() => undefined);
    await log(event.id, photo.id, "failed", message);
    if (err instanceof DriveError && err.status === 404) {
      throw new ApiError(502, "folder_unavailable", "The event photo folder is unavailable. Please let the host know.");
    }
    throw storageError(err);
  }

  // 5) Record success. Drive already has the file, so a DB failure here must not be reported as a failed upload.
  try {
    const updated = await withRetry(() =>
      repo.updatePhoto(photo.id, {
        upload_status: "uploaded",
        google_drive_file_id: file.id,
        file_name: file.name ?? fileName,
        uploaded_at: new Date().toISOString(),
        error_message: null,
      }),
    );
    await log(event.id, photo.id, "uploaded");
    return { photo: updated ?? photo, duplicate: false, recorded: true };
  } catch (err) {
    console.error("[gatherly] Drive upload succeeded but DB update failed; reconciliation will repair", photo.id, (err as Error).message);
    await log(event.id, photo.id, "recorded_failed", (err as Error).message);
    return { photo: { ...photo, google_drive_file_id: file.id, upload_status: "uploaded" }, duplicate: false, recorded: false };
  }
}

async function uploadOnce(
  drive: DriveClient,
  args: { photo: PhotoRow; event: EventRow; folderId: string; fileName: string; mime: string; bytes: Uint8Array; guestName: string | null },
): Promise<DriveFile> {
  const { photo, event, folderId } = args;
  // A previous attempt may have reached Drive even though the client saw an error.
  const prior = await drive.findByAppProperty("gatherlyPhotoId", photo.id, folderId).catch(() => null);
  if (prior) return prior;

  const doUpload = () =>
    drive.uploadFile({
      name: args.fileName,
      mimeType: args.mime,
      bytes: args.bytes,
      parentId: folderId,
      description: `Shared by ${args.guestName ?? "a guest"} at ${event.event_name} via Gatherly`,
      appProperties: { gatherlyPhotoId: photo.id, gatherlyEventId: event.id },
    });

  try {
    return await doUpload();
  } catch (err) {
    if (err instanceof DriveAuthError || !(err instanceof DriveError) || !err.retryable) throw err;
    // Timeout / 5xx / rate limit: check whether it landed before trying again so we never create duplicates.
    await new Promise((r) => setTimeout(r, 800));
    const landed = await drive.findByAppProperty("gatherlyPhotoId", photo.id, folderId).catch(() => null);
    if (landed) return landed;
    return doUpload();
  }
}

/**
 * Repairs rows left `pending`/`failed` by interrupted requests: if the file
 * exists in Drive (tagged with our photo id) it is marked uploaded;
 * long-abandoned pending rows are marked failed.
 */
export async function reconcileEvent(event: EventRow): Promise<{ checked: number; repaired: number; abandoned: number }> {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const rows = await repo.listUnsettledPhotos(event.id, cutoff);
  if (!rows.length) return { checked: 0, repaired: 0, abandoned: 0 };
  const { drive } = await getDrive();
  let repaired = 0;
  let abandoned = 0;
  for (const row of rows) {
    const file = await drive.findByAppProperty("gatherlyPhotoId", row.id, event.google_drive_folder_id).catch(() => null);
    if (file) {
      await repo.updatePhoto(row.id, { upload_status: "uploaded", google_drive_file_id: file.id, file_name: file.name ?? row.file_name, uploaded_at: row.uploaded_at ?? new Date().toISOString(), error_message: null });
      await log(event.id, row.id, "reconciled");
      repaired++;
    } else if (row.upload_status === "pending" && Date.now() - new Date(row.updated_at).getTime() > 15 * 60_000) {
      await repo.updatePhoto(row.id, { upload_status: "failed", error_message: "abandoned: upload never completed" });
      abandoned++;
    }
  }
  return { checked: rows.length, repaired, abandoned };
}
