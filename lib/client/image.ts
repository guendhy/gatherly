"use client";

/**
 * Prepares a photo for upload in the browser:
 *  - decodes with EXIF orientation applied (so sideways iPhone shots come out upright)
 *  - downsizes to a sensible long edge
 *  - re-encodes as JPEG under the server's size limit (also strips most metadata, incl. GPS)
 */

export const MAX_EDGE = 2560;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall back to <img>, which Safari uses for HEIC */
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("decode_failed");
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/jpeg", quality));
}

export async function drawToJpeg(source: CanvasImageSource, width: number, height: number, maxBytes: number, mirror = false): Promise<Blob> {
  let size = targetSize(width, height);
  let quality = 0.88;
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingQuality = "high";
    if (mirror) {
      ctx.translate(size.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const blob = await toJpeg(canvas, quality);
    canvas.width = canvas.height = 0; // free memory on iOS
    if (blob.size <= maxBytes) return blob;
    if (quality > 0.62) quality -= 0.1;
    else size = { width: Math.round(size.width * 0.8), height: Math.round(size.height * 0.8) };
  }
  throw new Error("too_large");
}

export async function preparePhoto(file: Blob, maxBytes: number): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file isn't a photo. Please choose an image.");
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    // Browser can't decode (e.g. HEIC on desktop Chrome) — send original if the server can take it.
    if (file.size <= maxBytes && ACCEPTED.includes(file.type)) return file;
    throw new Error("This photo format can't be processed on this device. Please choose a JPEG or PNG photo.");
  }
  try {
    return await drawToJpeg(decoded.source, decoded.width, decoded.height, maxBytes);
  } catch (err) {
    if ((err as Error).message === "too_large") throw new Error("This photo is too large to upload. Please choose another.");
    throw new Error("We couldn't process that photo. Please try another.");
  } finally {
    decoded.release();
  }
}

export function newUploadId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  const bytes = c.getRandomValues(new Uint8Array(16)); // iOS < 15.4 has no randomUUID
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
