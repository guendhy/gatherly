import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError } from "./errors";
import { sha256Hex } from "./crypto";

/** Client IP as reported by Vercel's edge (x-forwarded-for is overwritten by Vercel, not client-controlled). */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Short, non-reversible identifier for rate-limit keys so raw IPs are never stored. */
export function ipFingerprint(req: NextRequest): string {
  return sha256Hex(`ip:${getClientIp(req)}`).slice(0, 20);
}

/**
 * CSRF defence for state-changing requests: browsers always send Origin on
 * cross-site POST/PATCH/DELETE, so require it to match this host.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    const site = req.headers.get("sec-fetch-site");
    if (!site || site === "same-origin" || site === "none") return; // non-browser clients / same-origin
    throw new ApiError(403, "bad_origin", "Request blocked.");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return;
  } catch {
    /* fall through */
  }
  throw new ApiError(403, "bad_origin", "Request blocked.");
}

export async function parseJson<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(400, "invalid_input", first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.");
  }
  return result.data;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertUuid(value: string, what = "id"): void {
  if (!UUID_RE.test(value)) throw new ApiError(404, "not_found", `Unknown ${what}.`);
}

export function assertSlug(value: string): void {
  if (!SLUG_RE.test(value) || value.length > 80) throw new ApiError(404, "event_not_found", "We couldn't find that event.");
}
