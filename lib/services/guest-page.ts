import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ConfigError } from "@/lib/errors";
import { guestCookieName } from "@/lib/guest-session";
import { SLUG_RE } from "@/lib/request";
import * as repo from "@/lib/repo";
import type { EventRow } from "@/lib/types";
import { guestCanOpen, resolveGuestSession } from "./access";

export type GuestPage =
  | { kind: "ok"; event: EventRow }
  | { kind: "needs_access"; event: EventRow }
  | { kind: "closed" }
  | { kind: "unavailable" };

/** Server-component helper: loads the event and checks the guest's session cookie. */
export async function loadGuestPage(slug: string): Promise<GuestPage> {
  if (!SLUG_RE.test(slug) || slug.length > 80) notFound();
  let event: EventRow | null;
  try {
    event = await repo.getEventBySlug(slug);
  } catch (err) {
    if (err instanceof ConfigError) return { kind: "unavailable" };
    throw err;
  }
  if (!event) notFound();
  if (!guestCanOpen(event)) return { kind: "closed" };
  const store = await cookies();
  try {
    const ctx = await resolveGuestSession(event, store.get(guestCookieName(event.id))?.value);
    return ctx ? { kind: "ok", event } : { kind: "needs_access", event };
  } catch (err) {
    if (err instanceof ConfigError) return { kind: "unavailable" };
    throw err;
  }
}
