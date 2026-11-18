import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { getConfiguredParentFolderId, getEncryptionKey, getGoogleOAuthConfig, getLegacyDriveEnv } from "@/lib/env";
import * as repo from "@/lib/repo";
import type { GoogleConnectionRow } from "@/lib/types";
import { createDriveClient, DriveAuthError, type DriveClient } from "./drive";
import { GoogleOAuthError, refreshGoogleAccessToken, type GoogleTokens } from "./oauth";

type CachedToken = { key: string; token: string; expiresAt: number };
let memo: CachedToken | null = null; // per serverless instance

const SKEW_MS = 90_000;

export type StorageStatus = {
  connected: boolean;
  source: "oauth" | "env" | null;
  email: string | null;
  status: GoogleConnectionRow["status"] | null;
  lastError: string | null;
  scope: string | null;
  rootFolderId: string | null;
  connectedAt: string | null;
};

export async function getStorageStatus(): Promise<StorageStatus> {
  const conn = await repo.getActiveGoogleConnection();
  if (conn) {
    return {
      connected: conn.status === "active",
      source: "oauth",
      email: conn.account_email,
      status: conn.status,
      lastError: conn.last_error,
      scope: conn.scope,
      rootFolderId: conn.root_folder_id,
      connectedAt: conn.created_at,
    };
  }
  const legacy = getLegacyDriveEnv();
  return {
    connected: Boolean(legacy.refreshToken),
    source: legacy.refreshToken ? "env" : null,
    email: null,
    status: legacy.refreshToken ? "active" : null,
    lastError: null,
    scope: null,
    rootFolderId: legacy.folderId ?? null,
    connectedAt: null,
  };
}

async function refreshWith(refreshToken: string): Promise<GoogleTokens> {
  const cfg = getGoogleOAuthConfig();
  return refreshGoogleAccessToken({ refreshToken, clientId: cfg.clientId, clientSecret: cfg.clientSecret });
}

function oauthTokenProvider(conn: GoogleConnectionRow) {
  const key = getEncryptionKey();
  const cacheKey = `db:${conn.id}`;
  return async ({ forceRefresh = false } = {}): Promise<string> => {
    const now = Date.now();
    if (!forceRefresh && memo?.key === cacheKey && memo.expiresAt - SKEW_MS > now) return memo.token;

    if (!forceRefresh && conn.access_token_enc && conn.access_token_expires_at) {
      const exp = new Date(conn.access_token_expires_at).getTime();
      if (exp - SKEW_MS > now) {
        try {
          const token = decryptSecret(conn.access_token_enc, key);
          memo = { key: cacheKey, token, expiresAt: exp };
          return token;
        } catch {
          /* fall through to refresh */
        }
      }
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(conn.refresh_token_enc, key);
    } catch {
      await repo.updateGoogleConnection(conn.id, { status: "error", last_error: "token_decrypt_failed" });
      throw new DriveAuthError("Stored Google token could not be decrypted (TOKEN_ENCRYPTION_KEY changed?)");
    }

    try {
      const tokens = await refreshWith(refreshToken);
      const expiresAt = new Date(now + tokens.expires_in * 1000);
      memo = { key: cacheKey, token: tokens.access_token, expiresAt: expiresAt.getTime() };
      conn.access_token_enc = encryptSecret(tokens.access_token, key);
      conn.access_token_expires_at = expiresAt.toISOString();
      await repo.updateGoogleConnection(conn.id, {
        access_token_enc: conn.access_token_enc,
        access_token_expires_at: conn.access_token_expires_at,
        ...(tokens.refresh_token ? { refresh_token_enc: encryptSecret(tokens.refresh_token, key) } : {}),
        status: "active",
        last_error: null,
      }).catch((e) => console.warn("[gatherly] could not persist refreshed Google token", (e as Error).message));
      return tokens.access_token;
    } catch (err) {
      if (err instanceof GoogleOAuthError && (err.code === "invalid_grant" || err.code === "unauthorized_client")) {
        memo = null;
        await repo.updateGoogleConnection(conn.id, { status: "error", last_error: "reauthorization_required" }).catch(() => undefined);
        throw new DriveAuthError();
      }
      throw err;
    }
  };
}

function legacyTokenProvider(refreshToken: string) {
  const cacheKey = "env";
  return async ({ forceRefresh = false } = {}): Promise<string> => {
    if (!forceRefresh && memo?.key === cacheKey && memo.expiresAt - SKEW_MS > Date.now()) return memo.token;
    try {
      const tokens = await refreshWith(refreshToken);
      memo = { key: cacheKey, token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
      return tokens.access_token;
    } catch (err) {
      if (err instanceof GoogleOAuthError && err.code === "invalid_grant") throw new DriveAuthError();
      throw err;
    }
  };
}

export type DriveContext = { drive: DriveClient; rootFolderId: string | null; source: "oauth" | "env"; connectionId: string | null };

/** Drive client authorised as the host. Throws 503 if Google Drive isn't connected. */
export async function getDrive(): Promise<DriveContext> {
  const conn = await repo.getActiveGoogleConnection();
  if (conn) {
    if (conn.status !== "active" && conn.last_error === "token_decrypt_failed") {
      throw new ApiError(503, "storage_unavailable", "Photo storage needs attention from the event host.");
    }
    return { drive: createDriveClient(oauthTokenProvider(conn)), rootFolderId: conn.root_folder_id, source: "oauth", connectionId: conn.id };
  }
  const legacy = getLegacyDriveEnv();
  if (legacy.refreshToken) {
    return { drive: createDriveClient(legacyTokenProvider(legacy.refreshToken)), rootFolderId: legacy.folderId ?? null, source: "env", connectionId: null };
  }
  throw new ApiError(503, "storage_not_connected", "Photo storage isn't connected yet. Please let the event host know.");
}

/** Called once after OAuth: verifies Drive write access and picks/creates the parent folder for event folders. */
export async function saveNewConnection(tokens: GoogleTokens, email: string | null, adminUserId: string): Promise<GoogleConnectionRow> {
  if (!tokens.refresh_token) {
    throw new ApiError(400, "no_refresh_token", "Google did not return a refresh token. Remove Gatherly's access at myaccount.google.com/permissions and connect again.");
  }
  const key = getEncryptionKey();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const drive = createDriveClient(async () => tokens.access_token);

  // Use the configured parent folder when this grant can write to it; otherwise create one.
  let rootFolderId: string | null = null;
  const configured = getConfiguredParentFolderId();
  if (configured) {
    const folder = await drive.getFile(configured, "id,mimeType,trashed,capabilities(canAddChildren)");
    if (folder && !folder.trashed && folder.capabilities?.canAddChildren) rootFolderId = folder.id;
  }
  if (!rootFolderId) rootFolderId = (await drive.createFolder("Gatherly Events")).id;

  memo = null;
  return repo.insertGoogleConnection({
    account_email: email,
    scope: tokens.scope ?? "",
    refresh_token_enc: encryptSecret(tokens.refresh_token, key),
    access_token_enc: encryptSecret(tokens.access_token, key),
    access_token_expires_at: expiresAt.toISOString(),
    root_folder_id: rootFolderId,
    connected_by: adminUserId,
  });
}

export async function disconnectGoogle(): Promise<string | null> {
  const conn = await repo.getActiveGoogleConnection();
  memo = null;
  await repo.revokeGoogleConnections();
  if (!conn) return null;
  try {
    return decryptSecret(conn.refresh_token_enc, getEncryptionKey());
  } catch {
    return null;
  }
}
