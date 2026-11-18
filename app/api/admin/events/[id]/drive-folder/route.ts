import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { route } from "@/lib/errors";
import { parseJson } from "@/lib/request";
import * as repo from "@/lib/repo";
import { loadAdminEvent } from "@/lib/services/admin-events";
import { ensureEventFolder, storageError, verifyFolderWritable } from "@/lib/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  /** Use an existing folder (verified writable). Omit/null to auto-create one. */
  folderId: z.string().trim().max(200).nullable().optional(),
});

/** Assigns (or creates) the Google Drive folder that receives this event's photos. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const { folderId } = await parseJson(req, Body);
  try {
    if (folderId) {
      const folder = await verifyFolderWritable(folderId);
      const updated = await repo.updateEvent(event.id, { google_drive_folder_id: folder.id });
      return NextResponse.json({ event: updated, folder });
    }
    const cleared = event.google_drive_folder_id ? await repo.updateEvent(event.id, { google_drive_folder_id: null }) : event;
    const id = await ensureEventFolder(cleared ?? event);
    return NextResponse.json({ event: await repo.getEventById(event.id), folder: { id, name: null } });
  } catch (err) {
    throw storageError(err);
  }
});
