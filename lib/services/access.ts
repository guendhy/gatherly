import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { decryptSecret, encryptSecret, generateAccessCode, hashAccessSecret, randomToken } from "@/lib/crypto";
import { getAppUrl, getEncryptionKey, getGuestSessionSeconds, getSessionSecret } from "@/lib/env";
import { createGuestSessionValue, guestCookieName, guestCookieOptions, verifyGuestSessionValue } from "@/lib/guest-session";
import * as repo from "@/lib/repo";
import type { AccessTokenRow, EventRow, PublicEvent } from "@/lib/types";

export type GuestContext = { event: EventRow; tokenId: string };

/** Guests may open an event while it is live, and browse it (read-only) once it has ended. */
export function guestCanOpen(event: EventRow): boolean {
  return event.status === "active" || event.status === "ended";
}

export function uploadsOpen(event: EventRow): boolean {
  return event.status === "active" && event.upload_enabled;
}

export function toPublicEvent(event: EventRow): PublicEvent {
  const cover = event.cover_drive_file_id
    ? `/api/events/${event.event_slug}/cover?v=${encodeURIComponent(event.cover_drive_file_id.slice(-8))}`
    : event.cover_image_url && /^https:\/\//.test(event.cover_image_url)
      ? event.cover_image_url
      : null;
  return {
    id: event.id,
    name: event.event_name,
    slug: event.event_slug,
    description: event.description,
    date: event.event_date,
    coverUrl: cover,
    status: event.status,
    uploadsOpen: uploadsOpen(event),
    galleryEnabled: event.gallery_enabled,
  };
}

function tokenUsable(token: AccessTokenRow | null, eventId: string, now = Date.now()): token is AccessTokenRow {
  if (!token || token.event_id !== eventId || token.revoked_at) return false;
  if (token.expires_at && new Date(token.expires_at).getTime() <= now) return false;
  return true;
}

const INVALID_LINK = new ApiError(403, "invalid_token", "This event link is invalid or has expired. Please scan the latest QR code from your host.");

export async function validateLinkToken(slug: string, token: string): Promise<GuestContext> {
  const event = await repo.getEventBySlug(slug);
  if (!event) throw new ApiError(404, "event_not_found", "We couldn't find that event.");
  if (!token || token.length < 20 || token.length > 200) throw INVALID_LINK;
  const row = await repo.findAccessTokenByHash(hashAccessSecret("link", token, getEncryptionKey()));
  if (!row || row.kind !== "link" || !tokenUsable(row, event.id)) throw INVALID_LINK;
  if (!guestCanOpen(event)) throw new ApiError(403, "event_closed", "This event isn't open to guests right now.");
  return { event, tokenId: row.id };
}

export async function validateAccessCode(code: string): Promise<GuestContext> {
  const row = await repo.findAccessTokenByHash(hashAccessSecret("code", code, getEncryptionKey()));
  const event = row ? await repo.getEventById(row.event_id) : null;
  if (!row || row.kind !== "code" || !event || !tokenUsable(row, event.id)) {
    throw new ApiError(403, "invalid_code", "That event code didn't work. Check it with your host and try again.");
  }
  if (!guestCanOpen(event)) throw new ApiError(403, "event_closed", "This event isn't open to guests right now.");
  return { event, tokenId: row.id };
}

/** Writes the signed guest-session cookie onto a response. */
export async function attachGuestSession(res: NextResponse, ctx: GuestContext): Promise<Date> {
  const token = await repo.getAccessTokenById(ctx.tokenId);
  let expires = new Date(Date.now() + getGuestSessionSeconds() * 1000);
  if (token?.expires_at && new Date(token.expires_at) < expires) expires = new Date(token.expires_at);
  res.cookies.set(guestCookieName(ctx.event.id), createGuestSessionValue(ctx.event.id, ctx.tokenId, expires, getSessionSecret()), guestCookieOptions(expires));
  return expires;
}

/**
 * Resolves a guest session from a cookie value. Re-checks the token on every
 * call, so revoking a QR code (or pausing the event) takes effect immediately.
 */
export async function resolveGuestSession(event: EventRow, cookieValue: string | undefined): Promise<GuestContext | null> {
  const session = verifyGuestSessionValue(cookieValue, event.id, getSessionSecret());
  if (!session) return null;
  const token = await repo.getAccessTokenById(session.tokenId);
  if (!tokenUsable(token, event.id) || !guestCanOpen(event)) return null;
  return { event, tokenId: session.tokenId };
}

export async function loadEventOr404(slug: string): Promise<EventRow> {
  const event = await repo.getEventBySlug(slug);
  if (!event) throw new ApiError(404, "event_not_found", "We couldn't find that event.");
  return event;
}

export async function requireGuest(req: NextRequest, slug: string): Promise<GuestContext> {
  const event = await loadEventOr404(slug);
  const ctx = await resolveGuestSession(event, req.cookies.get(guestCookieName(event.id))?.value);
  if (!ctx) {
    if (!guestCanOpen(event)) throw new ApiError(403, "event_closed", "This event isn't open to guests right now.");
    throw new ApiError(401, "session_required", "Please open this event from its QR code or invitation link.");
  }
  return ctx;
}

// ------------------------------------------------------------------ admin side

export type EventAccessDetails = {
  url: string | null;
  code: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

export function eventUrl(slug: string, token: string, origin?: string): string {
  return `${getAppUrl(origin)}/e/${slug}?token=${encodeURIComponent(token)}`;
}

/** Revokes existing QR tokens/codes for the event and issues a fresh pair. */
export async function rotateEventAccess(event: EventRow, expiresAt: string | null, origin?: string): Promise<EventAccessDetails> {
  const key = getEncryptionKey();
  const token = randomToken(32);
  const code = generateAccessCode();
  await repo.revokeAccessTokens(event.id);
  const rows = await repo.insertAccessTokens([
    { event_id: event.id, kind: "link", token_hash: hashAccessSecret("link", token, key), token_enc: encryptSecret(token, key), expires_at: expiresAt },
    { event_id: event.id, kind: "code", token_hash: hashAccessSecret("code", code, key), token_enc: encryptSecret(code, key), expires_at: expiresAt },
  ]);
  return { url: eventUrl(event.event_slug, token, origin), code, expiresAt, createdAt: rows[0]?.created_at ?? new Date().toISOString() };
}

export async function getEventAccess(event: EventRow, origin?: string): Promise<EventAccessDetails> {
  const key = getEncryptionKey();
  const rows = await repo.listActiveAccessTokens(event.id);
  const link = rows.find((r) => r.kind === "link");
  const code = rows.find((r) => r.kind === "code");
  const reveal = (row?: AccessTokenRow) => {
    if (!row?.token_enc) return null;
    try {
      return decryptSecret(row.token_enc, key);
    } catch {
      return null; // encryption key was rotated — admin needs to regenerate
    }
  };
  const token = reveal(link);
  return {
    url: token ? eventUrl(event.event_slug, token, origin) : null,
    code: reveal(code),
    expiresAt: link?.expires_at ?? null,
    createdAt: link?.created_at ?? null,
  };
}
