"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FolderCheck, ImageUp, Trash2 } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import { preparePhoto } from "@/lib/client/image";

export function CoverUploader({ eventId, hasCover, coverUrl }: { eventId: string; hasCover: boolean; coverUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await preparePhoto(file, 3.5 * 1024 * 1024);
      const form = new FormData();
      form.append("cover", blob, "cover.jpg");
      const res = await fetch(`/api/admin/events/${eventId}/cover`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, json?.error?.code ?? "error", json?.error?.message ?? "Upload failed.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">Cover image</h2>
      <p className="mt-1 text-sm text-stone-600">Shown at the top of the guest welcome page. Stored privately in the event&apos;s Drive folder.</p>
      {coverUrl && <img src={coverUrl} alt="Current cover" className="mt-4 aspect-[4/3] w-full rounded-2xl object-cover" />}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp size={16} /> {busy ? "Uploading…" : hasCover ? "Replace cover" : "Upload cover"}
        </button>
        {hasCover && (
          <button
            className="btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              await apiFetch(`/api/admin/events/${eventId}/cover`, { method: "DELETE" }).catch(() => undefined);
              router.refresh();
            }}
          >
            <Trash2 size={16} /> Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function DriveFolderSettings({ eventId, folderId, storageConnected }: { eventId: string; folderId: string | null; storageConnected: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(folderId ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(useExisting: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const raw = value.trim();
      const id = useExisting ? (raw.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? raw) : null;
      const res = await apiFetch<{ folder: { id: string; name: string | null } }>(`/api/admin/events/${eventId}/drive-folder`, { method: "POST", json: { folderId: id } });
      setValue(res.folder.id);
      setMsg({ ok: true, text: useExisting ? `Verified${res.folder.name ? ` “${res.folder.name}”` : ""} — Gatherly can upload here.` : "Created a new Drive folder for this event." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiClientError ? err.message : "Could not update the folder." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">Google Drive folder</h2>
      {!storageConnected ? (
        <p className="mt-2 text-sm text-stone-600">
          Connect Google Drive in{" "}
          <a href="/admin/settings" className="font-semibold text-sage-700 underline">
            Settings
          </a>{" "}
          first. Gatherly then creates a folder for this event automatically.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-600">Photos upload into this folder. Leave it as created by Gatherly unless you need a specific folder.</p>
          <label htmlFor="folder" className="label mt-4">
            Folder ID or link
          </label>
          <input id="folder" className="input font-mono text-sm" placeholder="Created automatically" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" disabled={busy || !value.trim() || value.trim() === folderId} onClick={() => void save(true)}>
              <FolderCheck size={16} /> Verify &amp; use this folder
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                if (!folderId || confirm("Create a new folder? New photos will go there; existing photos stay in the old folder.")) void save(false);
              }}
            >
              {folderId ? "Create a new folder" : "Create folder now"}
            </button>
          </div>
          {msg && (
            <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-sage-700" : "text-red-700"}`}>
              {msg.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
