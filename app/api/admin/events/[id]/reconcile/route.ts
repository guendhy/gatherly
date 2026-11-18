import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { route } from "@/lib/errors";
import { loadAdminEvent } from "@/lib/services/admin-events";
import { storageError } from "@/lib/services/events";
import { reconcileEvent } from "@/lib/services/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Repairs photos whose Drive upload finished but whose database record didn't. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  try {
    return NextResponse.json({ result: await reconcileEvent(event) });
  } catch (err) {
    throw storageError(err);
  }
});
