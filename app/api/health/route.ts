import { NextResponse } from "next/server";
import { getConfigChecks } from "@/lib/env";
import { pingDatabase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness check. Reports only coarse states — no configuration values or variable names. */
export async function GET() {
  const checks = getConfigChecks();
  const configured = checks.filter((c) => c.key !== "admins" && c.key !== "appUrl").every((c) => c.ok);
  let database: "ok" | "unavailable" = "unavailable";
  if (checks[0].ok) {
    database = (await pingDatabase().catch(() => false)) ? "ok" : "unavailable";
  }
  const ok = configured && database === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, configured, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
