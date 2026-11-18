import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** URL-safe random secret (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// No 0/O, 1/I/L — easy to read aloud and type on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Human-friendly event code, e.g. "K7PQ-M9XA" (~40 bits; brute force is rate limited). */
export function generateAccessCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function looksLikeAccessCode(input: string): boolean {
  const n = normalizeAccessCode(input);
  return n.length === 8 && [...n].every((c) => CODE_ALPHABET.includes(c));
}

function subKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `gatherly:${purpose}`, 32));
}

/**
 * Deterministic, peppered hash used to look up access tokens/codes.
 * A database leak alone is not enough to brute-force short event codes.
 */
export function hashAccessSecret(kind: "link" | "code", value: string, masterKey: Buffer): string {
  const normalized = kind === "code" ? normalizeAccessCode(value) : value;
  return createHmac("sha256", subKey(masterKey, "token-hash")).update(`${kind}:${normalized}`).digest("hex");
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subKey(masterKey, "encrypt"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, masterKey: Buffer): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", subKey(masterKey, "encrypt"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function hmacSign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signed, expiring JSON envelope: base64url(json).signature */
export function signPayload(data: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${hmacSign(body, secret)}`;
}

export function verifyPayload<T extends { exp: number }>(value: string | undefined, secret: string, now = Date.now()): T | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || !safeEqual(sig, hmacSign(body, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof data.exp !== "number" || data.exp * 1000 <= now) return null;
    return data;
  } catch {
    return null;
  }
}
