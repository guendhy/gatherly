import "server-only";
import { getServiceClient } from "@/lib/supabase/admin";
import type {
  AccessTokenRow,
  AdminRow,
  EventRow,
  EventStats,
  GoogleConnectionRow,
  PhotoRow,
  UploadLogRow,
} from "@/lib/types";

/**
 * Every database query lives here so the API layer stays testable
 * (tests replace this module with an in-memory fake).
 */

function db() {
  return getServiceClient();
}

function fail(op: string, error: { message: string; code?: string } | null): never {
  console.error(`[gatherly] db ${op} failed`, error?.code, error?.message);
  throw new Error(`Database error during ${op}`);
}

const UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------- events

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const { data, error } = await db().from("events").select("*").eq("event_slug", slug).maybeSingle();
  if (error) fail("getEventBySlug", error);
  return data as EventRow | null;
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const { data, error } = await db().from("events").select("*").eq("id", id).maybeSingle();
  if (error) fail("getEventById", error);
  return data as EventRow | null;
}

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await db().from("events").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) fail("listEvents", error);
  return (data ?? []) as EventRow[];
}

export async function getEventStats(eventIds: string[]): Promise<Record<string, EventStats>> {
  if (!eventIds.length) return {};
  const { data, error } = await db().from("event_stats").select("*").in("event_id", eventIds);
  if (error) fail("getEventStats", error);
  const out: Record<string, EventStats> = {};
  for (const row of (data ?? []) as EventStats[]) {
    out[row.event_id] = {
      ...row,
      uploaded_count: Number(row.uploaded_count),
      failed_count: Number(row.failed_count),
      pending_count: Number(row.pending_count),
    };
  }
  return out;
}

export async function slugExists(slug: string): Promise<boolean> {
  const { count, error } = await db().from("events").select("id", { count: "exact", head: true }).eq("event_slug", slug);
  if (error) fail("slugExists", error);
  return (count ?? 0) > 0;
}

export async function countEvents(): Promise<number> {
  const { count, error } = await db().from("events").select("id", { count: "exact", head: true });
  if (error) fail("countEvents", error);
  return count ?? 0;
}

export type NewEvent = Pick<EventRow, "event_name" | "event_slug" | "description" | "event_date" | "status" | "upload_enabled" | "gallery_enabled" | "created_by"> &
  Partial<Pick<EventRow, "cover_image_url" | "google_drive_folder_id">>;

export async function insertEvent(input: NewEvent): Promise<EventRow | "slug_taken"> {
  const { data, error } = await db().from("events").insert(input).select("*").single();
  if (error?.code === UNIQUE_VIOLATION) return "slug_taken";
  if (error) fail("insertEvent", error);
  return data as EventRow;
}

export type EventPatch = Partial<
  Pick<EventRow, "event_name" | "description" | "event_date" | "cover_image_url" | "cover_drive_file_id" | "google_drive_folder_id" | "status" | "upload_enabled" | "gallery_enabled" | "ended_at">
>;

export async function updateEvent(id: string, patch: EventPatch): Promise<EventRow | null> {
  const { data, error } = await db().from("events").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) fail("updateEvent", error);
  return data as EventRow | null;
}

/** Sets the Drive folder only if none is set yet. Returns false if another request won the race. */
export async function setEventFolderIfEmpty(id: string, folderId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("events")
    .update({ google_drive_folder_id: folderId })
    .eq("id", id)
    .is("google_drive_folder_id", null)
    .select("id");
  if (error) fail("setEventFolderIfEmpty", error);
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------- access tokens

export async function findAccessTokenByHash(hash: string): Promise<AccessTokenRow | null> {
  const { data, error } = await db().from("event_access_tokens").select("*").eq("token_hash", hash).maybeSingle();
  if (error) fail("findAccessTokenByHash", error);
  return data as AccessTokenRow | null;
}

export async function getAccessTokenById(id: string): Promise<AccessTokenRow | null> {
  const { data, error } = await db().from("event_access_tokens").select("*").eq("id", id).maybeSingle();
  if (error) fail("getAccessTokenById", error);
  return data as AccessTokenRow | null;
}

export async function listActiveAccessTokens(eventId: string): Promise<AccessTokenRow[]> {
  const { data, error } = await db()
    .from("event_access_tokens")
    .select("*")
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) fail("listActiveAccessTokens", error);
  return (data ?? []) as AccessTokenRow[];
}

export async function revokeAccessTokens(eventId: string): Promise<void> {
  const { error } = await db()
    .from("event_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .is("revoked_at", null);
  if (error) fail("revokeAccessTokens", error);
}

export async function insertAccessTokens(rows: Array<Omit<AccessTokenRow, "id" | "created_at" | "revoked_at">>): Promise<AccessTokenRow[]> {
  const { data, error } = await db().from("event_access_tokens").insert(rows).select("*");
  if (error) fail("insertAccessTokens", error);
  return (data ?? []) as AccessTokenRow[];
}

// ---------------------------------------------------------------- photos

export async function getPhotoByClientId(eventId: string, clientUploadId: string): Promise<PhotoRow | null> {
  const { data, error } = await db()
    .from("photos")
    .select("*")
    .eq("event_id", eventId)
    .eq("client_upload_id", clientUploadId)
    .maybeSingle();
  if (error) fail("getPhotoByClientId", error);
  return data as PhotoRow | null;
}

export async function getUploadedPhotoBySha(eventId: string, sha256: string): Promise<PhotoRow | null> {
  const { data, error } = await db()
    .from("photos")
    .select("*")
    .eq("event_id", eventId)
    .eq("sha256", sha256)
    .eq("upload_status", "uploaded")
    .limit(1)
    .maybeSingle();
  if (error) fail("getUploadedPhotoBySha", error);
  return data as PhotoRow | null;
}

export type NewPhoto = Pick<PhotoRow, "id" | "event_id" | "guest_name" | "file_name" | "mime_type" | "file_size" | "sha256" | "client_upload_id">;

export async function insertPendingPhoto(input: NewPhoto): Promise<PhotoRow | "conflict"> {
  const { data, error } = await db()
    .from("photos")
    .insert({ ...input, upload_status: "pending" })
    .select("*")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return "conflict";
  if (error) fail("insertPendingPhoto", error);
  return data as PhotoRow;
}

export type PhotoPatch = Partial<Pick<PhotoRow, "guest_name" | "file_name" | "google_drive_file_id" | "mime_type" | "file_size" | "sha256" | "upload_status" | "error_message" | "uploaded_at">>;

export async function updatePhoto(id: string, patch: PhotoPatch): Promise<PhotoRow | null> {
  const { data, error } = await db().from("photos").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) fail("updatePhoto", error);
  return data as PhotoRow | null;
}

/** Always scoped by event — a photo id from another event is simply "not found". */
export async function getEventPhoto(eventId: string, photoId: string): Promise<PhotoRow | null> {
  const { data, error } = await db().from("photos").select("*").eq("event_id", eventId).eq("id", photoId).maybeSingle();
  if (error) fail("getEventPhoto", error);
  return data as PhotoRow | null;
}

export async function getPhotoById(photoId: string): Promise<PhotoRow | null> {
  const { data, error } = await db().from("photos").select("*").eq("id", photoId).maybeSingle();
  if (error) fail("getPhotoById", error);
  return data as PhotoRow | null;
}

export type PhotoCursor = { at: string; id: string };

export async function listUploadedPhotos(eventId: string, limit: number, cursor?: PhotoCursor | null): Promise<PhotoRow[]> {
  let q = db()
    .from("photos")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .order("uploaded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (cursor) q = q.or(`uploaded_at.lt."${cursor.at}",and(uploaded_at.eq."${cursor.at}",id.lt.${cursor.id})`);
  const { data, error } = await q;
  if (error) fail("listUploadedPhotos", error);
  return (data ?? []) as PhotoRow[];
}

export async function listAllPhotos(eventId: string, limit = 200): Promise<PhotoRow[]> {
  const { data, error } = await db()
    .from("photos")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listAllPhotos", error);
  return (data ?? []) as PhotoRow[];
}

export async function listUnsettledPhotos(eventId: string, olderThanIso: string): Promise<PhotoRow[]> {
  const { data, error } = await db()
    .from("photos")
    .select("*")
    .eq("event_id", eventId)
    .in("upload_status", ["pending", "failed"])
    .lt("updated_at", olderThanIso)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) fail("listUnsettledPhotos", error);
  return (data ?? []) as PhotoRow[];
}

// ---------------------------------------------------------------- upload logs

export async function insertUploadLog(row: Pick<UploadLogRow, "event_id" | "photo_id" | "status" | "error_message">): Promise<void> {
  const { error } = await db().from("upload_logs").insert(row);
  if (error) console.error("[gatherly] failed to write upload log", error.message);
}

export async function listUploadLogs(eventId: string, limit = 50): Promise<UploadLogRow[]> {
  const { data, error } = await db()
    .from("upload_logs")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listUploadLogs", error);
  return (data ?? []) as UploadLogRow[];
}

// ---------------------------------------------------------------- admins

export async function getAdminByUserId(userId: string): Promise<AdminRow | null> {
  const { data, error } = await db().from("admins").select("*").eq("user_id", userId).maybeSingle();
  if (error) fail("getAdminByUserId", error);
  return data as AdminRow | null;
}

export async function insertAdmin(userId: string, role: AdminRow["role"]): Promise<AdminRow> {
  const { data, error } = await db()
    .from("admins")
    .upsert({ user_id: userId, role }, { onConflict: "user_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) fail("insertAdmin", error);
  return data as AdminRow;
}

export async function countAdmins(): Promise<number> {
  const { count, error } = await db().from("admins").select("id", { count: "exact", head: true });
  if (error) fail("countAdmins", error);
  return count ?? 0;
}

// ---------------------------------------------------------------- google connections

export async function getActiveGoogleConnection(): Promise<GoogleConnectionRow | null> {
  const { data, error } = await db()
    .from("google_connections")
    .select("*")
    .in("status", ["active", "error"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("getActiveGoogleConnection", error);
  return data as GoogleConnectionRow | null;
}

export async function insertGoogleConnection(
  row: Pick<GoogleConnectionRow, "account_email" | "scope" | "refresh_token_enc" | "access_token_enc" | "access_token_expires_at" | "root_folder_id" | "connected_by">,
): Promise<GoogleConnectionRow> {
  const { error: revokeError } = await db().from("google_connections").update({ status: "revoked" }).in("status", ["active", "error"]);
  if (revokeError) fail("revokeGoogleConnections", revokeError);
  const { data, error } = await db().from("google_connections").insert({ ...row, status: "active" }).select("*").single();
  if (error) fail("insertGoogleConnection", error);
  return data as GoogleConnectionRow;
}

export async function updateGoogleConnection(
  id: string,
  patch: Partial<Pick<GoogleConnectionRow, "access_token_enc" | "access_token_expires_at" | "refresh_token_enc" | "status" | "last_error" | "root_folder_id">>,
): Promise<void> {
  const { error } = await db().from("google_connections").update(patch).eq("id", id);
  if (error) fail("updateGoogleConnection", error);
}

export async function revokeGoogleConnections(): Promise<void> {
  const { error } = await db().from("google_connections").update({ status: "revoked" }).in("status", ["active", "error"]);
  if (error) fail("revokeGoogleConnections", error);
}

// ---------------------------------------------------------------- rate limiting & health

export async function rateLimitHit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number; resetAt: string }> {
  const { data, error } = await db().rpc("gatherly_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) fail("rateLimitHit", error);
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; current_count: number; reset_at: string };
  return { allowed: row.allowed, count: row.current_count, resetAt: row.reset_at };
}

export async function pingDatabase(): Promise<boolean> {
  const { error } = await db().from("events").select("id", { head: true, count: "exact" }).limit(1);
  return !error;
}
