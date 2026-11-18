import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { DriveError } from "@/lib/google/drive";
import { createFakeRepo } from "./fake-repo";

/** Shared singletons used by vi.mock factories in the API tests. */
export const fake = createFakeRepo();

type FakeFile = { id: string; name: string; parents: string[]; appProperties?: Record<string, string>; bytes?: Uint8Array; mimeType: string; folder?: boolean };

export function createFakeDrive() {
  const files = new Map<string, FakeFile>();
  const plan: Array<{ error: DriveError; landFirst?: boolean }> = [];
  const api = {
    createFolder: vi.fn(async (name: string, parentId?: string | null) => {
      const f: FakeFile = { id: `folder-${randomUUID().slice(0, 8)}`, name, parents: parentId ? [parentId] : [], mimeType: "application/vnd.google-apps.folder", folder: true };
      files.set(f.id, f);
      return { id: f.id, name };
    }),
    getFile: vi.fn(async (id: string) => {
      const f = files.get(id);
      return f ? { id: f.id, name: f.name, mimeType: f.mimeType, trashed: false, capabilities: { canAddChildren: Boolean(f.folder) } } : null;
    }),
    uploadFile: vi.fn(async (input: { name: string; mimeType: string; bytes: Uint8Array; parentId: string; appProperties?: Record<string, string> }) => {
      if (!files.get(input.parentId)?.folder) throw new DriveError("File not found: parent", 404, "notFound", false);
      const step = plan.shift();
      const f: FakeFile = { id: `file-${randomUUID().slice(0, 8)}`, name: input.name, parents: [input.parentId], appProperties: input.appProperties, bytes: input.bytes, mimeType: input.mimeType };
      if (step && !step.landFirst) throw step.error;
      files.set(f.id, f);
      if (step?.landFirst) throw step.error; // e.g. timeout after Drive actually stored the file
      return { id: f.id, name: f.name, mimeType: f.mimeType };
    }),
    findByAppProperty: vi.fn(async (key: string, value: string, parentId?: string | null) => {
      const f = [...files.values()].find((x) => x.appProperties?.[key] === value && (!parentId || x.parents.includes(parentId)));
      return f ? { id: f.id, name: f.name } : null;
    }),
    downloadMedia: vi.fn(async (id: string) => {
      const f = files.get(id);
      if (!f) throw new DriveError("not found", 404, "notFound", false);
      return new Response(Buffer.from(f.bytes ?? new Uint8Array()), { headers: { "content-type": f.mimeType, "content-length": String(f.bytes?.length ?? 0) } });
    }),
    downloadThumbnail: vi.fn(async () => null),
    deleteFile: vi.fn(async (id: string) => void files.delete(id)),
  };
  return {
    api,
    files,
    /** Next upload fails with `error`. With landFirst, the file is stored before the error (timeout-after-success). */
    failNextUpload(error: DriveError, landFirst = false) {
      plan.push({ error, landFirst });
    },
    photoFiles: () => [...files.values()].filter((f) => !f.folder),
    reset() {
      files.clear();
      plan.length = 0;
      files.set("root-folder", { id: "root-folder", name: "Gatherly Events", parents: [], mimeType: "application/vnd.google-apps.folder", folder: true });
    },
  };
}

export const drive = createFakeDrive();
export const storage = { available: true };

export const connectionMock = {
  getDrive: async () => {
    if (!storage.available) throw new ApiError(503, "storage_not_connected", "Photo storage isn't connected yet. Please let the event host know.");
    return { drive: drive.api, rootFolderId: "root-folder", source: "oauth" as const, connectionId: "conn-1" };
  },
  getStorageStatus: async () => ({ connected: storage.available, source: "oauth", email: "host@example.com", status: "active", lastError: null, scope: "drive.file", rootFolderId: "root-folder", connectedAt: null }),
  saveNewConnection: vi.fn(),
  disconnectGoogle: vi.fn(async () => null),
};

/** Supabase auth stand-in: the `test-user` cookie selects a user. */
export const users: Record<string, { id: string; email: string; email_confirmed_at: string | null }> = {
  admin: { id: "00000000-0000-4000-8000-0000000000a1", email: "host@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
  stranger: { id: "00000000-0000-4000-8000-0000000000b2", email: "guest@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
};

export const supabaseServerMock = {
  createRouteAuthClient: (req: { cookies: { get: (n: string) => { value: string } | undefined } }) => ({
    auth: {
      getUser: async () => ({ data: { user: users[req.cookies.get("test-user")?.value ?? ""] ?? null } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  }),
  createServerComponentAuthClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
};

export function resetAll() {
  for (const v of Object.values(fake.state)) {
    if (v instanceof Map) v.clear();
    else if (Array.isArray(v)) v.length = 0;
  }
  drive.reset();
  storage.available = true;
  process.env.ADMIN_EMAILS = "host@example.com";
}
