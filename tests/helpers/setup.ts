import { NextRequest } from "next/server";

export const TEST_ENV = {
  NEXT_PUBLIC_APP_URL: "https://gatherly.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
  SESSION_SECRET: "test-session-secret-0123456789abcdefghijklmnop",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  UPLOAD_MAX_MB: "1",
};

export function applyTestEnv() {
  Object.assign(process.env, TEST_ENV);
}

const ORIGIN = "https://gatherly.test";

export function req(path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", "gatherly.test");
  if (init.method && init.method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.cookies) headers.set("cookie", Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  return new NextRequest(new URL(path, ORIGIN), {
    method: init.method ?? "GET",
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

/** Extracts `name=value` pairs from Set-Cookie headers on a response. */
export function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const idx = pair!.indexOf("=");
    out[pair!.slice(0, idx)] = pair!.slice(idx + 1);
  }
  return out;
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

// Minimal valid image headers
export const JPEG = (size = 2048, fill = 0) => {
  const b = new Uint8Array(size).fill(fill);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  return b;
};
export const PNG = () => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};
export const HEIC = () => {
  const b = new Uint8Array(64);
  b.set([0, 0, 0, 0x18, ...Buffer.from("ftypheic")]);
  return b;
};
