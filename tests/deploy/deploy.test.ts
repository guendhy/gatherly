import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repo", async () => (await import("../helpers/mocks")).fake.repo);
vi.mock("@/lib/google/connection", async () => (await import("../helpers/mocks")).connectionMock);
vi.mock("@/lib/supabase/server", async () => (await import("../helpers/mocks")).supabaseServerMock);

import { getConfigChecks, getSupabaseConfig } from "@/lib/env";
import { ConfigError } from "@/lib/errors";
import { signPayload } from "@/lib/crypto";
import * as callback from "@/app/api/admin/google/callback/route";
import { connectionMock, resetAll } from "../helpers/mocks";
import { applyTestEnv, req, TEST_ENV } from "../helpers/setup";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("Vercel compatibility", () => {
  const routes = walk(join(ROOT, "app", "api")).filter((f) => f.endsWith("route.ts"));

  it("every API route runs on the Node.js runtime and is dynamic", () => {
    expect(routes.length).toBeGreaterThan(15);
    for (const file of routes) {
      const src = readFileSync(file, "utf8");
      expect(src, relative(ROOT, file)).toContain('export const runtime = "nodejs"');
      expect(src, relative(ROOT, file)).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("no server code writes to the local filesystem (serverless is ephemeral)", () => {
    const files = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))].filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of files) expect(readFileSync(f, "utf8"), relative(ROOT, f)).not.toMatch(/writeFile|createWriteStream|mkdirSync/);
  });

  it("client components never import server-only modules or secrets", () => {
    const files = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "lib", "client"))].filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!src.startsWith('"use client"') && !f.includes(`${join("lib", "client")}`)) continue;
      expect(src, relative(ROOT, f)).not.toMatch(/from "@\/lib\/(repo|env|crypto|supabase|google|services|auth)/);
      expect(src, relative(ROOT, f)).not.toMatch(/SERVICE_ROLE|CLIENT_SECRET|TOKEN_ENCRYPTION_KEY|SESSION_SECRET/);
    }
  });

  it("server libraries are guarded with server-only", () => {
    for (const f of ["lib/repo.ts", "lib/env.ts", "lib/crypto.ts", "lib/supabase/admin.ts", "lib/google/connection.ts", "lib/google/drive.ts"]) {
      expect(readFileSync(join(ROOT, f), "utf8").startsWith('import "server-only"'), f).toBe(true);
    }
  });

  it(".env.local is git-ignored and .env.example contains no real secrets", () => {
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8")).toMatch(/^\.env\.local$/m);
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=$/m);
    expect(example).toMatch(/^GOOGLE_CLIENT_SECRET=$/m);
    expect(example).toMatch(/^TOKEN_ENCRYPTION_KEY=$/m);
  });
});

describe("environment validation", () => {
  it("names missing variables without exposing values", () => {
    const saved = { ...process.env };
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    try {
      getSupabaseConfig();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).missing).toEqual(expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY"]));
      expect((e as ConfigError).message).not.toContain("x.supabase.co");
    } finally {
      process.env = saved;
    }
  });

  it("reports setup completeness", () => {
    applyTestEnv();
    process.env.ADMIN_EMAILS = "host@example.com";
    expect(getConfigChecks().every((c) => c.ok)).toBe(true);
    process.env.TOKEN_ENCRYPTION_KEY = "short";
    expect(getConfigChecks().find((c) => c.key === "encryption")!.ok).toBe(false);
    process.env.TOKEN_ENCRYPTION_KEY = TEST_ENV.TOKEN_ENCRYPTION_KEY;
  });
});

describe("Google OAuth callback", () => {
  beforeAll(() => {
    applyTestEnv();
    resetAll();
  });

  it("rejects a missing or mismatched state", async () => {
    const res = await callback.GET(req("/api/admin/google/callback?code=abc&state=forged", { cookies: { "test-user": "admin" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("reason=state_mismatch");
    expect(connectionMock.saveNewConnection).not.toHaveBeenCalled();
  });

  it("rejects a state issued to a different admin", async () => {
    const state = signPayload({ s: "st-1", u: "someone-else", exp: Math.floor(Date.now() / 1000) + 600 }, TEST_ENV.SESSION_SECRET);
    const res = await callback.GET(req("/api/admin/google/callback?code=abc&state=st-1", { cookies: { "test-user": "admin", gatherly_oauth_state: state } }));
    expect(res.headers.get("location")).toContain("reason=not_admin");
  });

  it("stores the connection only after a successful, verified exchange", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/drive.file" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const state = signPayload({ s: "st-2", u: "00000000-0000-4000-8000-0000000000a1", exp: Math.floor(Date.now() / 1000) + 600 }, TEST_ENV.SESSION_SECRET);
    const res = await callback.GET(req("/api/admin/google/callback?code=abc&state=st-2", { cookies: { "test-user": "admin", gatherly_oauth_state: state } }));
    expect(res.headers.get("location")).toContain("google=connected");
    expect(connectionMock.saveNewConnection).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
