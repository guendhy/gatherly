import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateAccessCode, hashAccessSecret, looksLikeAccessCode, normalizeAccessCode, signPayload, verifyPayload } from "@/lib/crypto";
import { createGuestSessionValue, verifyGuestSessionValue } from "@/lib/guest-session";
import { parseEncryptionKey } from "@/lib/env";

const KEY = Buffer.alloc(32, 7);
const SECRET = "s".repeat(40);

describe("encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("refresh-token-123", KEY);
    const b = encryptSecret("refresh-token-123", KEY);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("refresh-token-123");
    expect(decryptSecret(a, KEY)).toBe("refresh-token-123");
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const ct = encryptSecret("secret", KEY);
    const parts = ct.split(".");
    parts[3] = Buffer.from("xxxxxx").toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
    expect(() => decryptSecret(ct, Buffer.alloc(32, 8))).toThrow();
  });

  it("parses hex and base64 keys, rejects short ones", () => {
    expect(parseEncryptionKey("ab".repeat(32))?.length).toBe(32);
    expect(parseEncryptionKey(Buffer.alloc(32, 1).toString("base64"))?.length).toBe(32);
    expect(parseEncryptionKey("too-short")).toBeNull();
    // iPhone-friendly: two Safari "strong passwords" joined together.
    const phrase = "hupwyx-9Gozva-qimden-Xyfry4-tagnuv-Kemzi6";
    expect(parseEncryptionKey(phrase)?.length).toBe(32);
    expect(parseEncryptionKey(phrase)).toEqual(parseEncryptionKey(phrase));
  });
});

describe("access tokens and codes", () => {
  it("hashes deterministically with a pepper, separated by kind", () => {
    expect(hashAccessSecret("link", "abc", KEY)).toBe(hashAccessSecret("link", "abc", KEY));
    expect(hashAccessSecret("link", "abc", KEY)).not.toBe(hashAccessSecret("code", "abc", KEY));
    expect(hashAccessSecret("link", "abc", KEY)).not.toBe(hashAccessSecret("link", "abc", Buffer.alloc(32, 9)));
  });

  it("generates readable codes and normalises user input", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(looksLikeAccessCode(code.toLowerCase().replace("-", " "))).toBe(true);
    }
    expect(normalizeAccessCode(" k7pq-m9xa ")).toBe("K7PQM9XA");
    expect(hashAccessSecret("code", "k7pq m9xa", KEY)).toBe(hashAccessSecret("code", "K7PQ-M9XA", KEY));
    expect(looksLikeAccessCode("hello")).toBe(false);
  });
});

describe("signed payloads / guest sessions", () => {
  it("verifies valid payloads and rejects tampering or expiry", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const v = signPayload({ a: 1, exp }, SECRET);
    expect(verifyPayload(v, SECRET)).toMatchObject({ a: 1 });
    expect(verifyPayload(v, "other-secret".padEnd(40, "x"))).toBeNull();
    const [body, sig] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ a: 2, exp })).toString("base64url");
    expect(verifyPayload(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyPayload(`${body}.${sig}`, SECRET, (exp + 1) * 1000)).toBeNull();
  });

  it("binds a guest session to one event", () => {
    const eventA = "11111111-1111-1111-1111-111111111111";
    const eventB = "22222222-2222-2222-2222-222222222222";
    const value = createGuestSessionValue(eventA, "tok-1", new Date(Date.now() + 3600_000), SECRET);
    expect(verifyGuestSessionValue(value, eventA, SECRET)?.tokenId).toBe("tok-1");
    expect(verifyGuestSessionValue(value, eventB, SECRET)).toBeNull();
    expect(verifyGuestSessionValue(undefined, eventA, SECRET)).toBeNull();
  });
});
