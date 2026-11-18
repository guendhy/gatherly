import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { route } from "@/lib/errors";
import * as repo from "@/lib/repo";
import { loadAdminEvent } from "@/lib/services/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  return NextResponse.json({ logs: await repo.listUploadLogs(event.id, 100) }, { headers: { "Cache-Control": "no-store" } });
});
