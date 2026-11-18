import "server-only";

/**
 * Minimal Google Drive v3 client built on fetch (no 100 MB googleapis bundle,
 * fast serverless cold starts). Only the calls Gatherly needs.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

/** The stored Google grant no longer works — the host must reconnect Google Drive. */
export class DriveAuthError extends DriveError {
  constructor(message = "Google Drive authorization is no longer valid") {
    super(message, 401, "reauthorization_required", false);
    this.name = "DriveAuthError";
  }
}

export type AccessTokenProvider = (opts?: { forceRefresh?: boolean }) => Promise<string>;

export type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  thumbnailLink?: string;
  capabilities?: { canAddChildren?: boolean };
  appProperties?: Record<string, string>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function readDriveError(res: Response): Promise<DriveError> {
  let reason = `http_${res.status}`;
  let message = `Google Drive request failed (${res.status})`;
  try {
    const json = (await res.json()) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
    reason = json.error?.errors?.[0]?.reason ?? reason;
    message = json.error?.message ?? message;
  } catch {
    /* non-JSON body */
  }
  const rateLimited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(reason));
  return new DriveError(message, res.status, reason, rateLimited || res.status >= 500);
}

export function createDriveClient(getToken: AccessTokenProvider, defaults: { timeoutMs?: number } = {}) {
  const baseTimeout = defaults.timeoutMs ?? 20_000;

  async function request(url: string, init: RequestInit = {}, opts: { timeoutMs?: number; retries?: number } = {}): Promise<Response> {
    const retries = opts.retries ?? 2;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({ forceRefresh: refreshed });
      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(opts.timeoutMs ?? baseTimeout),
          cache: "no-store",
        });
      } catch (err) {
        const timedOut = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
        if (attempt < retries) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new DriveError(timedOut ? "Google Drive timed out" : "Could not reach Google Drive", 0, timedOut ? "timeout" : "network", true);
      }
      if (res.ok) return res;
      if (res.status === 401 && !refreshed) {
        refreshed = true; // access token revoked/expired early — refresh once and retry
        continue;
      }
      if (res.status === 401) throw new DriveAuthError();
      const error = await readDriveError(res);
      if (error.retryable && attempt < retries) {
        await sleep(500 * 2 ** attempt + Math.random() * 250);
        continue;
      }
      throw error;
    }
  }

  return {
    async createFolder(name: string, parentId?: string | null): Promise<DriveFile> {
      const res = await request(`${API}/files?supportsAllDrives=true&fields=id,name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}), appProperties: { gatherly: "folder" } }),
      });
      return (await res.json()) as DriveFile;
    },

    /** null when the file doesn't exist or this OAuth grant can't see it. */
    async getFile(fileId: string, fields = "id,name,mimeType,size,parents,trashed"): Promise<DriveFile | null> {
      try {
        const res = await request(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`, {}, { retries: 1 });
        return (await res.json()) as DriveFile;
      } catch (err) {
        if (err instanceof DriveError && err.status === 404) return null;
        throw err;
      }
    },

    /**
     * Single-request multipart upload. Not retried here: a timeout could mean
     * the file *was* created, so callers check `findByAppProperty` first.
     */
    async uploadFile(input: {
      name: string;
      mimeType: string;
      bytes: Uint8Array;
      parentId: string;
      description?: string;
      appProperties?: Record<string, string>;
      timeoutMs?: number;
    }): Promise<DriveFile> {
      const boundary = `gatherly-${crypto.randomUUID()}`;
      const meta = JSON.stringify({
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
        description: input.description,
        appProperties: input.appProperties,
      });
      const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`);
      const tail = Buffer.from(`\r\n--${boundary}--`);
      const body = Buffer.concat([head, Buffer.from(input.bytes), tail]);
      const res = await request(
        `${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,parents`,
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) }, body },
        { timeoutMs: input.timeoutMs ?? 45_000, retries: 0 },
      );
      const file = (await res.json()) as DriveFile;
      if (!file.id) throw new DriveError("Google Drive did not return a file id", 502, "no_file_id", true);
      return file;
    },

    async findByAppProperty(key: string, value: string, parentId?: string | null): Promise<DriveFile | null> {
      const clauses = [`appProperties has { key='${escapeQuery(key)}' and value='${escapeQuery(value)}' }`, "trashed = false"];
      if (parentId) clauses.push(`'${escapeQuery(parentId)}' in parents`);
      const params = new URLSearchParams({
        q: clauses.join(" and "),
        fields: "files(id,name,mimeType,size,parents)",
        pageSize: "5",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      const res = await request(`${API}/files?${params.toString()}`, {}, { retries: 2 });
      const json = (await res.json()) as { files?: DriveFile[] };
      return json.files?.[0] ?? null;
    },

    /** Raw media stream. Caller is responsible for authorization. */
    async downloadMedia(fileId: string): Promise<Response> {
      return request(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, { timeoutMs: 25_000, retries: 1 });
    },

    /** Drive-generated thumbnail at roughly `size` px, or null if not available yet. */
    async downloadThumbnail(fileId: string, size = 640): Promise<Response | null> {
      const file = await this.getFile(fileId, "id,thumbnailLink");
      if (!file?.thumbnailLink) return null;
      const url = file.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${size}`);
      try {
        const res = await request(url, {}, { timeoutMs: 10_000, retries: 0 });
        return res.headers.get("content-type")?.startsWith("image/") ? res : null;
      } catch {
        return null;
      }
    },

    async deleteFile(fileId: string): Promise<void> {
      await request(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" }, { retries: 1 });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
