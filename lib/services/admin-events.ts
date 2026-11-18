import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { assertUuid } from "@/lib/request";
import * as repo from "@/lib/repo";
import type { EventRow, EventStats } from "@/lib/types";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .nullable();

const coverUrl = z
  .string()
  .max(1000)
  .refine((v) => v === "" || /^https:\/\//.test(v), "must start with https://")
  .nullable();

export const CreateEventSchema = z.object({
  event_name: z.string().trim().min(1, "required").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  event_date: dateString.optional(),
  cover_image_url: coverUrl.optional(),
  status: z.enum(["draft", "active"]).default("active"),
  upload_enabled: z.boolean().default(true),
  gallery_enabled: z.boolean().default(true),
});

export const UpdateEventSchema = z
  .object({
    event_name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable(),
    event_date: dateString,
    cover_image_url: coverUrl,
    status: z.enum(["draft", "active", "paused", "ended"]),
    upload_enabled: z.boolean(),
    gallery_enabled: z.boolean(),
  })
  .partial()
  .strict();

export async function loadAdminEvent(id: string): Promise<EventRow> {
  assertUuid(id, "event");
  const event = await repo.getEventById(id);
  if (!event) throw new ApiError(404, "not_found", "Event not found.");
  return event;
}

export type AdminEventSummary = EventRow & { stats: EventStats };

export function emptyStats(eventId: string): EventStats {
  return { event_id: eventId, uploaded_count: 0, failed_count: 0, pending_count: 0, last_upload_at: null };
}

export async function listEventsWithStats(): Promise<AdminEventSummary[]> {
  const events = await repo.listEvents();
  const stats = await repo.getEventStats(events.map((e) => e.id));
  return events.map((e) => ({ ...e, stats: stats[e.id] ?? emptyStats(e.id) }));
}
