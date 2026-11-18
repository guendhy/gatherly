import { ApiError } from "./errors";

export type ImageKind = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif"; ext: string };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1", "heif"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Identify an image by its magic bytes — never trust the browser-supplied MIME type. */
export function detectImageType(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return { mime: "image/png", ext: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const major = ascii(bytes, 8, 12);
    if (HEIC_BRANDS.has(major)) return { mime: "image/heic", ext: "heic" };
    if (HEIF_BRANDS.has(major)) return { mime: "image/heif", ext: "heif" };
  }
  return null;
}

/** Validates size + real file content. Returns the detected type. */
export function validateImageBytes(bytes: Uint8Array, maxBytes: number): ImageKind {
  if (!bytes.length) throw new ApiError(400, "empty_file", "That photo appears to be empty. Please try again.");
  if (bytes.length > maxBytes) {
    throw new ApiError(413, "file_too_large", `That photo is too large (max ${(maxBytes / 1024 / 1024).toFixed(0)} MB).`);
  }
  const kind = detectImageType(bytes);
  if (!kind) throw new ApiError(415, "unsupported_type", "Only JPEG, PNG, WebP or HEIC photos can be uploaded.");
  return kind;
}

/** Strip control characters / markup and clamp length. Empty → null. */
export function cleanGuestName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned || null;
}

export function fileSafe(text: string, max = 32): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .toLowerCase() || "guest"
  );
}

export function buildPhotoFileName(eventSlug: string, guestName: string | null, photoId: string, ext: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${fileSafe(eventSlug, 40)}_${stamp}_${fileSafe(guestName ?? "guest", 24)}_${photoId.slice(0, 8)}.${ext}`;
}
