"use client";

/**
 * Keeps photos that haven't finished uploading in IndexedDB, so a dropped
 * connection, a closed tab or a phone lock never silently loses a photo.
 * Every function fails soft (private mode / storage disabled → no-op).
 */

export type PendingPhoto = { id: string; eventSlug: string; blob: Blob; guestName: string; createdAt: number };

const DB = "gatherly";
const STORE = "pending-uploads";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => {
        resolve(req ? (req.result as T) : null);
        db.close();
      };
      t.onerror = t.onabort = () => {
        resolve(null);
        db.close();
      };
    } catch {
      resolve(null);
    }
  });
}

export async function savePending(photo: PendingPhoto): Promise<void> {
  await tx("readwrite", (s) => s.put(photo));
}

export async function removePending(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function listPending(eventSlug: string): Promise<PendingPhoto[]> {
  const all = (await tx<PendingPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<PendingPhoto[]>)) ?? [];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  return all.filter((p) => p.eventSlug === eventSlug && p.createdAt > weekAgo).sort((a, b) => a.createdAt - b.createdAt);
}
