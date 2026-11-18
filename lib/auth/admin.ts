import "server-only";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/errors";
import { getAdminEmails, isSupabaseConfigured } from "@/lib/env";
import * as repo from "@/lib/repo";
import { createRouteAuthClient, createServerComponentAuthClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request";

export type AdminContext = { userId: string; email: string | null; role: "owner" | "admin" };

export type AdminPageState =
  | { state: "admin"; admin: AdminContext }
  | { state: "forbidden"; email: string | null }
  | { state: "anonymous" }
  | { state: "unconfigured" };

/**
 * Admin = a signed-in Supabase user with a row in `admins`. A confirmed
 * user whose email is listed in ADMIN_EMAILS is promoted on first sign-in,
 * which lets the host bootstrap the first admin without SQL or a
 * hard-coded password.
 */
async function adminFromUser(user: User | null): Promise<AdminContext | "forbidden" | null> {
  if (!user) return null;
  const existing = await repo.getAdminByUserId(user.id);
  if (existing) return { userId: user.id, email: user.email ?? null, role: existing.role };
  const email = user.email?.toLowerCase();
  if (email && user.email_confirmed_at && getAdminEmails().includes(email)) {
    const role = (await repo.countAdmins()) === 0 ? "owner" : "admin";
    const row = await repo.insertAdmin(user.id, role);
    return { userId: user.id, email: user.email ?? null, role: row.role };
  }
  return "forbidden";
}

export async function getAdminFromRequest(req: NextRequest): Promise<AdminContext | "forbidden" | null> {
  const supabase = createRouteAuthClient(req);
  const { data } = await supabase.auth.getUser();
  return adminFromUser(data.user ?? null);
}

/** Use in every /api/admin route. Also enforces same-origin for mutating methods. */
export async function requireAdmin(req: NextRequest): Promise<AdminContext> {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  const admin = await getAdminFromRequest(req);
  if (!admin) throw new ApiError(401, "unauthorized", "Please sign in as an administrator.");
  if (admin === "forbidden") throw new ApiError(403, "forbidden", "This account is not an administrator.");
  return admin;
}

export async function getAdminForPage(): Promise<AdminPageState> {
  if (!isSupabaseConfigured()) return { state: "unconfigured" };
  const supabase = await createServerComponentAuthClient();
  const { data } = await supabase.auth.getUser();
  const result = await adminFromUser(data.user ?? null);
  if (!result) return { state: "anonymous" };
  if (result === "forbidden") return { state: "forbidden", email: data.user?.email ?? null };
  return { state: "admin", admin: result };
}
