import "server-only";
import { ApiError } from "./errors";
import { rateLimitHit } from "./repo";

export type RateRule = { name: string; limit: number; windowSeconds: number };

export const RATE_RULES = {
  session: { name: "session", limit: 30, windowSeconds: 600 },
  accessCode: { name: "code", limit: 10, windowSeconds: 600 },
  upload: { name: "upload", limit: 40, windowSeconds: 600 },
  uploadPerEvent: { name: "upload-event", limit: 1500, windowSeconds: 600 },
  gallery: { name: "gallery", limit: 120, windowSeconds: 60 },
  image: { name: "image", limit: 900, windowSeconds: 60 },
  login: { name: "login", limit: 10, windowSeconds: 600 },
} satisfies Record<string, RateRule>;

/**
 * Fixed-window rate limit backed by Postgres (shared across all serverless
 * instances). Fails open if the limiter itself is unavailable so a database
 * hiccup never blocks guests mid-event; the failure is logged.
 */
export async function enforceRateLimit(rule: RateRule, subject: string): Promise<void> {
  let result: Awaited<ReturnType<typeof rateLimitHit>>;
  try {
    result = await rateLimitHit(`${rule.name}:${subject}`, rule.limit, rule.windowSeconds);
  } catch (err) {
    console.warn("[gatherly] rate limiter unavailable, allowing request", (err as Error).message);
    return;
  }
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000));
    throw new ApiError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", { retryAfter });
  }
}
