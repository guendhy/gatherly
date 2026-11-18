/**
 * In-memory stand-in for lib/repo.ts so API routes can be exercised end to end
 * without a database. Mirrors the real constraints that matter (unique keys).
 */
import { randomUUID } from "node:crypto";
import type { AccessTokenRow, AdminRow, EventRow, GoogleConnectionRow, PhotoRow, UploadLogRow } from "@/lib/types";

export function createFakeRepo() {
  const events = new Map<string, EventRow>();
  const tokens = new Map<string, AccessTokenRow>();
  const photos = new Map<string, PhotoRow>();
  const logs: UploadLogRow[] = [];
  const admins = new Map<string, AdminRow>();
  const connections: GoogleConnectionRow[] = [];
  const rate = new Map<string, { start: number; count: number }>();
  const now = () => new Date().toISOString();

  const repo = {
    // events
    getEventBySlug: async (slug: string) => [...events.values()].find((e) => e.event_slug === slug) ?? null,
    getEventById: async (id: string) => events.get(id) ?? null,
    listEvents: async () => [...events.values()],
    getEventStats: async (ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => {
          const ps = [...photos.values()].filter((p) => p.event_id === id);
          return [id, { event_id: id, uploaded_count: ps.filter((p) => p.upload_status === "uploaded").length, failed_count: ps.filter((p) => p.upload_status === "failed").length, pending_count: ps.filter((p) => p.upload_status === "pending").length, last_upload_at: null }];
        }),
      ),
    slugExists: async (slug: string) => [...events.values()].some((e) => e.event_slug === slug),
    countEvents: async () => events.size,
    insertEvent: async (input: Partial<EventRow>) => {
      if ([...events.values()].some((e) => e.event_slug === input.event_slug)) return "slug_taken" as const;
      const row: EventRow = {
        id: randomUUID(),
        event_name: input.event_name!,
        event_slug: input.event_slug!,
        description: input.description ?? null,
        event_date: input.event_date ?? null,
        cover_image_url: input.cover_image_url ?? null,
        cover_drive_file_id: null,
        google_drive_folder_id: input.google_drive_folder_id ?? null,
        status: input.status ?? "active",
        upload_enabled: input.upload_enabled ?? true,
        gallery_enabled: input.gallery_enabled ?? true,
        created_by: input.created_by ?? null,
        ended_at: null,
        created_at: now(),
        updated_at: now(),
      };
      events.set(row.id, row);
      return row;
    },
    updateEvent: async (id: string, patch: Partial<EventRow>) => {
      const e = events.get(id);
      if (!e) return null;
      Object.assign(e, patch, { updated_at: now() });
      return { ...e };
    },
    setEventFolderIfEmpty: async (id: string, folderId: string) => {
      const e = events.get(id);
      if (!e || e.google_drive_folder_id) return false;
      e.google_drive_folder_id = folderId;
      return true;
    },
    // tokens
    findAccessTokenByHash: async (hash: string) => [...tokens.values()].find((t) => t.token_hash === hash) ?? null,
    getAccessTokenById: async (id: string) => tokens.get(id) ?? null,
    listActiveAccessTokens: async (eventId: string) => [...tokens.values()].filter((t) => t.event_id === eventId && !t.revoked_at).reverse(),
    revokeAccessTokens: async (eventId: string) => {
      for (const t of tokens.values()) if (t.event_id === eventId && !t.revoked_at) t.revoked_at = now();
    },
    insertAccessTokens: async (rows: Array<Omit<AccessTokenRow, "id" | "created_at" | "revoked_at">>) =>
      rows.map((r) => {
        const row: AccessTokenRow = { ...r, id: randomUUID(), created_at: now(), revoked_at: null };
        tokens.set(row.id, row);
        return row;
      }),
    // photos
    getPhotoByClientId: async (eventId: string, cid: string) => [...photos.values()].find((p) => p.event_id === eventId && p.client_upload_id === cid) ?? null,
    getUploadedPhotoBySha: async (eventId: string, sha: string) => [...photos.values()].find((p) => p.event_id === eventId && p.sha256 === sha && p.upload_status === "uploaded") ?? null,
    insertPendingPhoto: async (input: Partial<PhotoRow>) => {
      if ([...photos.values()].some((p) => p.event_id === input.event_id && p.client_upload_id === input.client_upload_id)) return "conflict" as const;
      const row: PhotoRow = {
        id: input.id ?? randomUUID(),
        event_id: input.event_id!,
        guest_name: input.guest_name ?? null,
        file_name: input.file_name!,
        google_drive_file_id: null,
        mime_type: input.mime_type!,
        file_size: input.file_size!,
        sha256: input.sha256 ?? null,
        client_upload_id: input.client_upload_id!,
        upload_status: "pending",
        error_message: null,
        uploaded_at: null,
        created_at: now(),
        updated_at: now(),
      };
      photos.set(row.id, row);
      return row;
    },
    updatePhoto: async (id: string, patch: Partial<PhotoRow>) => {
      const p = photos.get(id);
      if (!p) return null;
      Object.assign(p, patch, { updated_at: now() });
      return { ...p };
    },
    getEventPhoto: async (eventId: string, id: string) => {
      const p = photos.get(id);
      return p && p.event_id === eventId ? p : null;
    },
    getPhotoById: async (id: string) => photos.get(id) ?? null,
    listUploadedPhotos: async (eventId: string, limit: number) =>
      [...photos.values()]
        .filter((p) => p.event_id === eventId && p.upload_status === "uploaded")
        .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))
        .slice(0, limit),
    listAllPhotos: async (eventId: string) => [...photos.values()].filter((p) => p.event_id === eventId),
    listUnsettledPhotos: async (eventId: string, olderThan: string) => [...photos.values()].filter((p) => p.event_id === eventId && p.upload_status !== "uploaded" && p.updated_at < olderThan),
    // logs
    insertUploadLog: async (row: Omit<UploadLogRow, "id" | "created_at">) => {
      logs.push({ ...row, id: randomUUID(), created_at: now() });
    },
    listUploadLogs: async (eventId: string) => logs.filter((l) => l.event_id === eventId),
    // admins
    getAdminByUserId: async (uid: string) => admins.get(uid) ?? null,
    insertAdmin: async (uid: string, role: AdminRow["role"]) => {
      const row: AdminRow = { id: randomUUID(), user_id: uid, role, created_at: now() };
      admins.set(uid, row);
      return row;
    },
    countAdmins: async () => admins.size,
    // google
    getActiveGoogleConnection: async () => connections.filter((c) => c.status !== "revoked").at(-1) ?? null,
    insertGoogleConnection: async (row: Partial<GoogleConnectionRow>) => {
      connections.forEach((c) => (c.status = "revoked"));
      const full = { ...row, id: randomUUID(), status: "active", last_error: null, created_at: now(), updated_at: now() } as GoogleConnectionRow;
      connections.push(full);
      return full;
    },
    updateGoogleConnection: async (id: string, patch: Partial<GoogleConnectionRow>) => {
      const c = connections.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    },
    revokeGoogleConnections: async () => connections.forEach((c) => (c.status = "revoked")),
    // infra
    rateLimitHit: async (key: string, limit: number, windowSeconds: number) => {
      const t = Date.now();
      const r = rate.get(key);
      if (!r || t - r.start >= windowSeconds * 1000) rate.set(key, { start: t, count: 1 });
      else r.count++;
      const cur = rate.get(key)!;
      return { allowed: cur.count <= limit, count: cur.count, resetAt: new Date(cur.start + windowSeconds * 1000).toISOString() };
    },
    pingDatabase: async () => true,
  };

  return { repo, state: { events, tokens, photos, logs, admins, connections, rate } };
}
