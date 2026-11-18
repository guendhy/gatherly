import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/env";

/** Auth client for Route Handlers: reads cookies from the request and writes refreshed cookies to `res`. */
export function createRouteAuthClient(req: NextRequest, res?: NextResponse) {
  const { url, anonKey } = getSupabaseConfig();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet, headers) => {
        if (!res) return;
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => res.headers.set(k, v));
      },
    },
  });
}

/** Auth client for Server Components (read-only cookies; middleware refreshes sessions). */
export async function createServerComponentAuthClient() {
  const { url, anonKey } = getSupabaseConfig();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; middleware handles refresh.
        }
      },
    },
  });
}
