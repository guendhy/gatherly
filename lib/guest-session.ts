import "server-only";
import { signPayload, verifyPayload } from "./crypto";

/** One httpOnly cookie per event, so a guest can hold sessions for two events at once. */
export function guestCookieName(eventId: string): string {
  return `gatherly_g_${eventId.replace(/-/g, "")}`;
}

type GuestPayload = { v: 1; e: string; t: string; exp: number };

export function createGuestSessionValue(eventId: string, tokenId: string, expiresAt: Date, secret: string): string {
  const payload: GuestPayload = { v: 1, e: eventId, t: tokenId, exp: Math.floor(expiresAt.getTime() / 1000) };
  return signPayload(payload, secret);
}

/** Returns the access-token id the session was issued from, or null if invalid / expired / for another event. */
export function verifyGuestSessionValue(value: string | undefined, eventId: string, secret: string, now = Date.now()): { tokenId: string; exp: number } | null {
  const data = verifyPayload<GuestPayload>(value, secret, now);
  if (!data || data.v !== 1 || data.e !== eventId || typeof data.t !== "string") return null;
  return { tokenId: data.t, exp: data.exp };
}

export function guestCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
