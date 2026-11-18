import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { route } from "@/lib/errors";
import { disconnectGoogle, getStorageStatus } from "@/lib/google/connection";
import { revokeGoogleToken } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json({ storage: await getStorageStatus() }, { headers: { "Cache-Control": "no-store" } });
});

/** Disconnects Google Drive and revokes the grant at Google. Existing photos stay in Drive. */
export const DELETE = route(async (req) => {
  await requireAdmin(req);
  const refreshToken = await disconnectGoogle();
  if (refreshToken) await revokeGoogleToken(refreshToken);
  return NextResponse.json({ ok: true });
});
