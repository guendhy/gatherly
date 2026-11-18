import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { ApiError, route } from "@/lib/errors";
import { parseJson } from "@/lib/request";
import { getEventAccess, rotateEventAccess } from "@/lib/services/access";
import { loadAdminEvent } from "@/lib/services/admin-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Current guest link + event code (decrypted for the admin only). */
export const GET = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  return NextResponse.json({ access: await getEventAccess(event, req.nextUrl.origin) }, { headers: { "Cache-Control": "no-store" } });
});

const Body = z.object({ expiresAt: z.string().datetime({ offset: true }).nullable().optional() });

/** Regenerates the QR token + event code. Previously printed QR codes stop working immediately. */
export const POST = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const event = await loadAdminEvent((await params).id);
  const { expiresAt } = await parseJson(req, Body);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new ApiError(400, "invalid_expiry", "Expiry must be in the future.");
  const access = await rotateEventAccess(event, expiresAt ?? null, req.nextUrl.origin);
  return NextResponse.json({ access }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
