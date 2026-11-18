/**
 * End-to-end API tests against the real route handlers, with the database and
 * Google Drive replaced by in-memory fakes.
 * Flow: create event → QR token → guest session → upload → Drive → gallery.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repo", async () => (await import("../helpers/mocks")).fake.repo);
vi.mock("@/lib/google/connection", async () => (await import("../helpers/mocks")).connectionMock);
vi.mock("@/lib/supabase/server", async () => (await import("../helpers/mocks")).supabaseServerMock);

import { DriveAuthError, DriveError } from "@/lib/google/drive";
import { guestCookieName } from "@/lib/guest-session";
import * as adminEvents from "@/app/api/admin/events/route";
import * as adminEvent from "@/app/api/admin/events/[id]/route";
import * as adminQr from "@/app/api/admin/events/[id]/qr/route";
import * as adminReconcile from "@/app/api/admin/events/[id]/reconcile/route";
import * as access from "@/app/api/access/route";
import * as session from "@/app/api/events/[slug]/session/route";
import * as eventRoute from "@/app/api/events/[slug]/route";
import * as photosRoute from "@/app/api/events/[slug]/photos/route";
import * as imageRoute from "@/app/api/events/[slug]/photos/[photoId]/image/route";
import * as health from "@/app/api/health/route";
import { drive, fake, resetAll, storage } from "../helpers/mocks";
import { applyTestEnv, cookiesFrom, JPEG, params, req } from "../helpers/setup";

beforeAll(applyTestEnv);
beforeEach(resetAll);

const ADMIN = { "test-user": "admin" };

type Created = { event: { id: string; event_slug: string }; access: { url: string; code: string } };

async function createEvent(body: Record<string, unknown> = {}): Promise<Created> {
  const res = await adminEvents.POST(req("/api/admin/events", { method: "POST", json: { event_name: "Nelfa's 30th", event_date: "2026-11-20", ...body }, cookies: ADMIN }), undefined);
  expect(res.status).toBe(201);
  return res.json();
}

function tokenOf(created: Created) {
  return new URL(created.access.url).searchParams.get("token")!;
}

async function joinEvent(created: Created): Promise<Record<string, string>> {
  const res = await session.POST(req(`/api/events/${created.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(created) } }), params({ slug: created.event.event_slug }));
  expect(res.status).toBe(200);
  return cookiesFrom(res);
}

function uploadReq(slug: string, cookies: Record<string, string>, bytes: Uint8Array, clientUploadId = "upload-0001", guestName = "Maria") {
  const form = new FormData();
  form.append("photo", new Blob([Buffer.from(bytes)], { type: "image/jpeg" }), "x.jpg");
  form.append("clientUploadId", clientUploadId);
  form.append("guestName", guestName);
  return photosRoute.POST(req(`/api/events/${slug}/photos`, { method: "POST", body: form, cookies }), params({ slug }));
}

describe("event access", () => {
  it("creates an event with a QR link of the form /e/<slug>?token=… and an event code", async () => {
    const created = await createEvent();
    expect(created.access.url).toMatch(new RegExp(`^https://gatherly\\.test/e/${created.event.event_slug}\\?token=[A-Za-z0-9_-]{40,}$`));
    expect(created.access.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Only hashes + ciphertext are stored, never the raw token.
    const stored = [...fake.state.tokens.values()];
    expect(JSON.stringify(stored)).not.toContain(tokenOf(created));
    // Drive folder created under the host's Gatherly folder.
    expect(fake.state.events.get(created.event.id)!.google_drive_folder_id).toMatch(/^folder-/);
  });

  it("a valid QR link opens the correct event", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const name = guestCookieName(created.event.id);
    expect(cookies[name]).toBeTruthy();
    const res = await eventRoute.GET(req(`/api/events/${created.event.event_slug}`, { cookies }), params({ slug: created.event.event_slug }));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toMatchObject({ name: "Nelfa's 30th", uploadsOpen: true });
  });

  it("rejects invalid tokens and tokens from another event", async () => {
    const a = await createEvent({ event_name: "Party A" });
    const b = await createEvent({ event_name: "Party B" });
    const bad = await session.POST(req(`/api/events/${a.event.event_slug}/session`, { method: "POST", json: { token: "x".repeat(43) } }), params({ slug: a.event.event_slug }));
    expect(bad.status).toBe(403);
    const crossed = await session.POST(req(`/api/events/${a.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(b) } }), params({ slug: a.event.event_slug }));
    expect(crossed.status).toBe(403);
    // A session cookie for B is useless on A.
    const bCookies = await joinEvent(b);
    const res = await eventRoute.GET(req(`/api/events/${a.event.event_slug}`, { cookies: bCookies }), params({ slug: a.event.event_slug }));
    expect(res.status).toBe(401);
  });

  it("rejects expired tokens", async () => {
    const created = await createEvent();
    for (const t of fake.state.tokens.values()) t.expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await session.POST(req(`/api/events/${created.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(created) } }), params({ slug: created.event.event_slug }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("invalid_token");
  });

  it("regenerating the QR code immediately revokes old links and sessions", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const rotated = await adminQr.POST(req(`/api/admin/events/${created.event.id}/qr`, { method: "POST", json: {}, cookies: ADMIN }), params({ id: created.event.id }));
    expect(rotated.status).toBe(201);
    const stale = await eventRoute.GET(req(`/api/events/${created.event.event_slug}`, { cookies }), params({ slug: created.event.event_slug }));
    expect(stale.status).toBe(401);
    const old = await session.POST(req(`/api/events/${created.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(created) } }), params({ slug: created.event.event_slug }));
    expect(old.status).toBe(403);
  });

  it("event codes work from the homepage; wrong codes are rejected", async () => {
    const created = await createEvent();
    const ok = await access.POST(req("/api/access", { method: "POST", json: { code: created.access.code.toLowerCase() } }), undefined);
    expect(ok.status).toBe(200);
    expect((await ok.json()).slug).toBe(created.event.event_slug);
    expect(cookiesFrom(ok)[guestCookieName(created.event.id)]).toBeTruthy();
    const bad = await access.POST(req("/api/access", { method: "POST", json: { code: "AAAA-BBBB" } }), undefined);
    expect(bad.status).toBe(403);
  });

  it("rate limits event-code guessing", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await access.POST(req("/api/access", { method: "POST", json: { code: "AAAA-BBBB" } }), undefined)).status;
    expect(last).toBe(429);
  });

  it("paused events refuse guests", async () => {
    const created = await createEvent();
    await adminEvent.PATCH(req(`/api/admin/events/${created.event.id}`, { method: "PATCH", json: { status: "paused" }, cookies: ADMIN }), params({ id: created.event.id }));
    const res = await session.POST(req(`/api/events/${created.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(created) } }), params({ slug: created.event.event_slug }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("event_closed");
  });

  it("blocks cross-site POSTs (CSRF)", async () => {
    const created = await createEvent();
    const r = req(`/api/events/${created.event.event_slug}/session`, { method: "POST", json: { token: tokenOf(created) }, headers: { origin: "https://evil.example" } });
    const res = await session.POST(r, params({ slug: created.event.event_slug }));
    expect(res.status).toBe(403);
  });
});

describe("uploads to Google Drive", () => {
  it("valid photos upload into the event's Drive folder and are recorded", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const res = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.photo.guestName).toBe("Maria");
    const [file] = drive.photoFiles();
    const folder = fake.state.events.get(created.event.id)!.google_drive_folder_id!;
    expect(file!.parents).toEqual([folder]);
    expect(file!.name).toMatch(/^nelfa-s-30th-[a-z0-9]+_\d{8}-\d{6}_maria_[0-9a-f]{8}\.jpg$/);
    const row = [...fake.state.photos.values()][0]!;
    expect(row).toMatchObject({ upload_status: "uploaded", google_drive_file_id: file!.id, guest_name: "Maria" });
    expect(file!.appProperties).toEqual({ gatherlyPhotoId: row.id, gatherlyEventId: created.event.id });
  });

  it("rejects unsupported files without touching Drive", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const res = await uploadReq(created.event.event_slug, cookies, new TextEncoder().encode("<?php system($_GET['x']); ?> padding padding"));
    expect(res.status).toBe(415);
    expect(drive.api.uploadFile).not.toHaveBeenCalled();
  });

  it("rejects oversized files", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const res = await uploadReq(created.event.event_slug, cookies, JPEG(1.2 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(drive.photoFiles()).toHaveLength(0);
  });

  it("requires a guest session", async () => {
    const created = await createEvent();
    const res = await uploadReq(created.event.event_slug, {}, JPEG());
    expect(res.status).toBe(401);
  });

  it("disabled uploads and ended events cannot accept photos", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    await adminEvent.PATCH(req(`/api/admin/events/${created.event.id}`, { method: "PATCH", json: { upload_enabled: false }, cookies: ADMIN }), params({ id: created.event.id }));
    expect((await uploadReq(created.event.event_slug, cookies, JPEG())).status).toBe(403);
    await adminEvent.PATCH(req(`/api/admin/events/${created.event.id}`, { method: "PATCH", json: { upload_enabled: true, status: "ended" }, cookies: ADMIN }), params({ id: created.event.id }));
    const ended = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(ended.status).toBe(403);
    expect((await ended.json()).error.code).toBe("event_closed");
    expect(drive.photoFiles()).toHaveLength(0);
  });

  it("Drive errors produce a recoverable failure; retry succeeds with one file", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    drive.failNextUpload(new DriveError("quota", 403, "storageQuotaExceeded", false));
    const fail = await uploadReq(created.event.event_slug, cookies, JPEG(), "retry-me-01");
    expect(fail.status).toBe(502);
    expect((await fail.json()).error.code).toBe("storage_failed");
    expect([...fake.state.photos.values()][0]).toMatchObject({ upload_status: "failed" });
    expect(fake.state.logs.some((l) => l.status === "failed")).toBe(true);

    const ok = await uploadReq(created.event.event_slug, cookies, JPEG(), "retry-me-01");
    expect(ok.status).toBe(201);
    expect(drive.photoFiles()).toHaveLength(1);
    expect(fake.state.photos.size).toBe(1);
  });

  it("an expired Google grant reports 503 so the host can reconnect", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    drive.failNextUpload(new DriveAuthError());
    const res = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("storage_reauth_required");
  });

  it("a timeout after Drive stored the file does not create a duplicate", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    drive.failNextUpload(new DriveError("Google Drive timed out", 0, "timeout", true), true);
    const res = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(res.status).toBe(201);
    expect(drive.photoFiles()).toHaveLength(1);
  });

  it("duplicate submissions do not create duplicate files", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    expect((await uploadReq(created.event.event_slug, cookies, JPEG(), "same-id-0001")).status).toBe(201);
    const again = await uploadReq(created.event.event_slug, cookies, JPEG(), "same-id-0001");
    expect(again.status).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
    const sameBytes = await uploadReq(created.event.event_slug, cookies, JPEG(), "other-id-0002");
    expect((await sameBytes.json()).duplicate).toBe(true);
    expect(drive.photoFiles()).toHaveLength(1);
  });

  it("concurrent in-flight retries get 409 instead of a second upload", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    await fake.repo.insertPendingPhoto({ event_id: created.event.id, client_upload_id: "inflight-001", file_name: "x.jpg", mime_type: "image/jpeg", file_size: 10, sha256: "zz" });
    const res = await uploadReq(created.event.event_slug, cookies, JPEG(), "inflight-001");
    expect(res.status).toBe(409);
  });

  it("reports success when Drive succeeded but the DB write failed, and reconciliation repairs it", async () => {
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const original = fake.repo.updatePhoto;
    const spy = vi.spyOn(fake.repo, "updatePhoto").mockImplementation(async (id, patch) => {
      if (patch.upload_status === "uploaded") throw new Error("db down");
      return original(id, patch);
    });
    const res = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(res.status).toBe(201);
    spy.mockRestore();
    const row = [...fake.state.photos.values()][0]!;
    expect(row.upload_status).toBe("pending");
    row.updated_at = new Date(Date.now() - 5 * 60_000).toISOString();
    const rec = await adminReconcile.POST(req(`/api/admin/events/${created.event.id}/reconcile`, { method: "POST", cookies: ADMIN }), params({ id: created.event.id }));
    expect((await rec.json()).result).toMatchObject({ repaired: 1 });
    expect(fake.state.photos.get(row.id)!.upload_status).toBe("uploaded");
  });

  it("returns 503 (not a fake success) when Drive isn't connected", async () => {
    storage.available = false;
    const created = await createEvent();
    const cookies = await joinEvent(created);
    const res = await uploadReq(created.event.event_slug, cookies, JPEG());
    expect(res.status).toBe(503);
    expect([...fake.state.photos.values()][0]!.upload_status).toBe("failed");
  });
});

describe("gallery", () => {
  async function seeded() {
    const a = await createEvent({ event_name: "Party A" });
    const b = await createEvent({ event_name: "Party B" });
    const ca = await joinEvent(a);
    const cb = await joinEvent(b);
    await uploadReq(a.event.event_slug, ca, JPEG(2048, 1), "a-photo-001", "Ann");
    await uploadReq(b.event.event_slug, cb, JPEG(2048, 2), "b-photo-001", "Ben");
    return { a, b, ca, cb };
  }

  it("shows only the event's own photos, without Drive ids", async () => {
    const { a, ca } = await seeded();
    const res = await photosRoute.GET(req(`/api/events/${a.event.event_slug}/photos`, { cookies: ca }), params({ slug: a.event.event_slug }));
    const body = await res.json();
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0].guestName).toBe("Ann");
    expect(JSON.stringify(body)).not.toMatch(/file-[0-9a-f]{8}|drive\.google/);
  });

  it("cannot fetch another event's photo through this event", async () => {
    const { a, b, ca } = await seeded();
    const bPhoto = [...fake.state.photos.values()].find((p) => p.event_id === b.event.id)!;
    const res = await imageRoute.GET(req(`/api/events/${a.event.event_slug}/photos/${bPhoto.id}/image`, { cookies: ca }), params({ slug: a.event.event_slug, photoId: bPhoto.id }));
    expect(res.status).toBe(404);
  });

  it("streams private images only to guests with a session, with private caching", async () => {
    const { a, ca } = await seeded();
    const photo = [...fake.state.photos.values()].find((p) => p.event_id === a.event.id)!;
    const anon = await imageRoute.GET(req(`/api/events/${a.event.event_slug}/photos/${photo.id}/image`), params({ slug: a.event.event_slug, photoId: photo.id }));
    expect(anon.status).toBe(401);
    const ok = await imageRoute.GET(req(`/api/events/${a.event.event_slug}/photos/${photo.id}/image?download=1`, { cookies: ca }), params({ slug: a.event.event_slug, photoId: photo.id }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("private");
    expect(ok.headers.get("content-disposition")).toContain("attachment");
    expect(new Uint8Array(await ok.arrayBuffer())[0]).toBe(0xff);
  });

  it("respects the admin's gallery toggle", async () => {
    const { a, ca } = await seeded();
    await adminEvent.PATCH(req(`/api/admin/events/${a.event.id}`, { method: "PATCH", json: { gallery_enabled: false }, cookies: ADMIN }), params({ id: a.event.id }));
    const res = await photosRoute.GET(req(`/api/events/${a.event.event_slug}/photos`, { cookies: ca }), params({ slug: a.event.event_slug }));
    expect(res.status).toBe(403);
    const photo = [...fake.state.photos.values()].find((p) => p.event_id === a.event.id)!;
    const img = await imageRoute.GET(req(`/api/events/${a.event.event_slug}/photos/${photo.id}/image`, { cookies: ca }), params({ slug: a.event.event_slug, photoId: photo.id }));
    expect(img.status).toBe(403);
  });
});

describe("admin authorization", () => {
  it("unauthenticated users cannot use admin routes", async () => {
    expect((await adminEvents.GET(req("/api/admin/events"), undefined)).status).toBe(401);
    expect((await adminEvents.POST(req("/api/admin/events", { method: "POST", json: { event_name: "x" } }), undefined)).status).toBe(401);
  });

  it("signed-in non-admins are forbidden; guests cannot modify event settings", async () => {
    const created = await createEvent();
    const guestCookies = await joinEvent(created);
    expect((await adminEvents.GET(req("/api/admin/events", { cookies: { "test-user": "stranger" } }), undefined)).status).toBe(403);
    const patch = await adminEvent.PATCH(req(`/api/admin/events/${created.event.id}`, { method: "PATCH", json: { gallery_enabled: false }, cookies: guestCookies }), params({ id: created.event.id }));
    expect(patch.status).toBe(401);
    expect(fake.state.events.get(created.event.id)!.gallery_enabled).toBe(true);
  });

  it("bootstraps the first admin from ADMIN_EMAILS (confirmed email only)", async () => {
    await createEvent();
    expect([...fake.state.admins.values()][0]).toMatchObject({ user_id: "00000000-0000-4000-8000-0000000000a1", role: "owner" });
  });

  it("rejects admin mutations from another origin", async () => {
    const res = await adminEvents.POST(req("/api/admin/events", { method: "POST", json: { event_name: "x" }, cookies: ADMIN, headers: { origin: "https://evil.example" } }), undefined);
    expect(res.status).toBe(403);
  });

  it("validates input strictly", async () => {
    const created = await createEvent();
    const bad = await adminEvent.PATCH(req(`/api/admin/events/${created.event.id}`, { method: "PATCH", json: { google_drive_folder_id: "hijack" }, cookies: ADMIN }), params({ id: created.event.id }));
    expect(bad.status).toBe(400);
    const badName = await adminEvents.POST(req("/api/admin/events", { method: "POST", json: { event_name: "" }, cookies: ADMIN }), undefined);
    expect(badName.status).toBe(400);
  });
});

describe("health endpoint", () => {
  it("reports status without leaking configuration", async () => {
    const res = await health.GET();
    const text = await res.text();
    expect(res.status).toBe(200);
    for (const secret of ["service-test-key", "test-session-secret", "test-client-secret", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_SECRET"]) expect(text).not.toContain(secret);
  });
});
