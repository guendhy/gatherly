import { afterEach, describe, expect, it, vi } from "vitest";
import { createDriveClient, DriveAuthError, DriveError } from "@/lib/google/drive";
import { buildGoogleAuthUrl, DRIVE_FILE_SCOPE, driveScopes, emailFromIdToken } from "@/lib/google/oauth";

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Google Drive REST client", () => {
  it("sends a multipart upload into the right folder with app properties", async () => {
    const fetchMock = vi.fn(async (..._args: [string, RequestInit]) => json({ id: "file-1", name: "a.jpg" }));
    vi.stubGlobal("fetch", fetchMock);
    const drive = createDriveClient(async () => "access-1");
    const file = await drive.uploadFile({ name: "a.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]), parentId: "folder-9", appProperties: { gatherlyPhotoId: "p1" } });
    expect(file.id).toBe("file-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("uploadType=multipart");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
    const body = (init.body as Buffer).toString("latin1");
    expect(body).toContain('"parents":["folder-9"]');
    expect(body).toContain('"gatherlyPhotoId":"p1"');
    expect(body).toContain("Content-Type: image/jpeg");
  });

  it("refreshes the access token once on 401, then retries", async () => {
    const tokens: boolean[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: { message: "expired" } }, 401)).mockResolvedValueOnce(json({ id: "folder-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const drive = createDriveClient(async (o) => {
      tokens.push(Boolean(o?.forceRefresh));
      return "t";
    });
    await expect(drive.createFolder("x")).resolves.toMatchObject({ id: "folder-1" });
    expect(tokens).toEqual([false, true]);
  });

  it("throws DriveAuthError when the grant is dead", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "nope" } }, 401)));
    const drive = createDriveClient(async () => "t");
    await expect(drive.createFolder("x")).rejects.toBeInstanceOf(DriveAuthError);
  });

  it("retries transient 5xx and surfaces a retryable DriveError", async () => {
    const fetchMock = vi.fn(async () => json({ error: { message: "backend", errors: [{ reason: "backendError" }] } }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const drive = createDriveClient(async () => "t");
    const err = await drive.createFolder("x").catch((e) => e);
    expect(err).toBeInstanceOf(DriveError);
    expect(err.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("does not retry uploads on its own (avoids duplicate files)", async () => {
    const fetchMock = vi.fn(async () => json({ error: { message: "backend" } }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const drive = createDriveClient(async () => "t");
    await expect(drive.uploadFile({ name: "a", mimeType: "image/jpeg", bytes: new Uint8Array(1), parentId: "f" })).rejects.toBeInstanceOf(DriveError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for files this grant cannot see", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "File not found" } }, 404)));
    await expect(createDriveClient(async () => "t").getFile("abc")).resolves.toBeNull();
  });

  it("searches by app property", async () => {
    const fetchMock = vi.fn(async (..._args: [string]) => json({ files: [{ id: "f1" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await createDriveClient(async () => "t").findByAppProperty("gatherlyPhotoId", "p'1", "folder");
    const q = new URL(fetchMock.mock.calls[0]![0]).searchParams.get("q");
    expect(q).toBe("appProperties has { key='gatherlyPhotoId' and value='p\\'1' } and trashed = false and 'folder' in parents");
  });
});

describe("Google OAuth helpers", () => {
  it("requests offline access with the minimal Drive scope by default", () => {
    const url = new URL(buildGoogleAuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st", scopes: driveScopes("file") }));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("scope")).toContain(DRIVE_FILE_SCOPE);
    expect(url.searchParams.get("scope")).not.toContain("auth/drive ");
  });

  it("reads the email claim from an id token", () => {
    const payload = Buffer.from(JSON.stringify({ email: "host@example.com" })).toString("base64url");
    expect(emailFromIdToken(`h.${payload}.s`)).toBe("host@example.com");
    expect(emailFromIdToken("garbage")).toBeNull();
  });
});
