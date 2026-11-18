import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { buildPhotoFileName, cleanGuestName, detectImageType, validateImageBytes } from "@/lib/image";
import { captureReducer, initialCaptureState, isRetryableUploadError, type CaptureState } from "@/lib/client/capture-machine";
import { targetSize } from "@/lib/client/image";
import { parseInvite } from "@/lib/client/invite";
import { eventSlug, slugify } from "@/lib/slug";
import { HEIC, JPEG, PNG } from "../helpers/setup";

describe("image content validation", () => {
  it("detects real image types from magic bytes", () => {
    expect(detectImageType(JPEG())?.mime).toBe("image/jpeg");
    expect(detectImageType(PNG())?.mime).toBe("image/png");
    expect(detectImageType(HEIC())?.mime).toBe("image/heic");
    const webp = new Uint8Array(32);
    webp.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect(detectImageType(webp)?.mime).toBe("image/webp");
  });

  it("rejects disguised, empty and oversized files", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(() => validateImageBytes(html, 1024 * 1024)).toThrowError(expect.objectContaining({ status: 415 }) as unknown as Error);
    expect(() => validateImageBytes(new Uint8Array(0), 1024)).toThrowError(ApiError);
    try {
      validateImageBytes(JPEG(5000), 4000);
    } catch (e) {
      expect((e as ApiError).status).toBe(413);
    }
  });

  it("sanitises guest names and builds unique, safe filenames", () => {
    expect(cleanGuestName("  <b>Mar\u0000ía</b>  ")).toBe("bMaría/b");
    expect(cleanGuestName("   ")).toBeNull();
    expect(cleanGuestName(42)).toBeNull();
    expect(cleanGuestName("x".repeat(100))!.length).toBe(60);
    const name = buildPhotoFileName("nelfa-30th-ab12c", "José O'Neil", "3f2a9c1e-0000-4000-8000-000000000000", "jpg", new Date("2026-11-20T18:05:09Z"));
    expect(name).toBe("nelfa-30th-ab12c_20261120-180509_jose-o-neil_3f2a9c1e.jpg");
  });
});

describe("slugs", () => {
  it("creates url-safe slugs with a random suffix", () => {
    expect(slugify("Nelfa's 30th Birthday! 🎉")).toBe("nelfa-s-30th-birthday");
    expect(eventSlug("Ü", () => "ab12c")).toBe("u-event-ab12c");
    expect(eventSlug("Wedding", () => "zz9zz")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("capture flow state machine (camera / retake / upload)", () => {
  const photo = { id: "abc12345", blob: new Blob(["x"]), url: "blob:1" };

  it("camera → preview → retake returns to start", () => {
    let s: CaptureState = captureReducer(initialCaptureState, { type: "CAMERA_STARTED" });
    expect(s.phase).toBe("live");
    s = captureReducer(s, { type: "PHOTO_READY", photo, source: "camera" });
    expect(s.phase).toBe("preview");
    s = captureReducer(s, { type: "RETAKE" });
    expect(s.phase).toBe("start");
  });

  it("file-input fallback reaches preview without the live camera", () => {
    const s = captureReducer(captureReducer(initialCaptureState, { type: "PROCESSING" }), { type: "PHOTO_READY", photo, source: "file" });
    expect(s).toMatchObject({ phase: "preview", source: "file" });
  });

  it("camera permission failure shows a notice and keeps fallbacks available", () => {
    const s = captureReducer(initialCaptureState, { type: "PROCESS_FAILED", message: "Camera access was not allowed." });
    expect(s).toMatchObject({ phase: "start", notice: "Camera access was not allowed." });
  });

  it("ignores double-tap uploads and only succeeds from uploading", () => {
    let s: CaptureState = captureReducer(initialCaptureState, { type: "PHOTO_READY", photo, source: "camera" });
    s = captureReducer(s, { type: "UPLOAD_START" });
    const again = captureReducer(s, { type: "UPLOAD_START" });
    expect(again).toBe(s);
    expect(captureReducer(initialCaptureState, { type: "UPLOAD_OK", duplicate: false }).phase).toBe("start");
    s = captureReducer(s, { type: "UPLOAD_PROGRESS", progress: 0.5 });
    s = captureReducer(s, { type: "UPLOAD_PROGRESS", progress: 0.3 });
    expect(s).toMatchObject({ progress: 0.5 });
    s = captureReducer(s, { type: "UPLOAD_FAILED", message: "offline", retryable: true });
    expect(s).toMatchObject({ phase: "error", retryable: true });
    s = captureReducer(s, { type: "UPLOAD_START" }); // retry keeps the same photo
    expect(s).toMatchObject({ phase: "uploading", photo });
  });

  it("classifies upload failures", () => {
    expect(isRetryableUploadError(0, "network")).toBe(true);
    expect(isRetryableUploadError(502, "storage_failed")).toBe(true);
    expect(isRetryableUploadError(429, "rate_limited")).toBe(true);
    expect(isRetryableUploadError(415, "unsupported_type")).toBe(false);
    expect(isRetryableUploadError(413, "file_too_large")).toBe(false);
    expect(isRetryableUploadError(403, "uploads_disabled")).toBe(false);
  });

  it("downscales large photos but never upscales", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 2560, height: 1920 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1920, height: 2560 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("homepage invite parsing", () => {
  it("accepts full links, relative links and codes", () => {
    expect(parseInvite("https://x.app/e/my-party-ab12c?token=abc_DEF-123", "https://x.app")).toEqual({ kind: "link", path: "/e/my-party-ab12c?token=abc_DEF-123" });
    expect(parseInvite("/e/my-party-ab12c?token=t0k", "https://x.app")).toEqual({ kind: "link", path: "/e/my-party-ab12c?token=t0k" });
    expect(parseInvite("k7pq-m9xa", "https://x.app")).toEqual({ kind: "code", code: "k7pq-m9xa" });
    expect(parseInvite("https://x.app/e/party", "https://x.app")).toBeNull();
    expect(parseInvite("  ", "https://x.app")).toBeNull();
  });
});
