"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, Play, RotateCw } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import type { EventStatus } from "@/lib/types";
import { Toggle } from "./EventForm";

type Props = { eventId: string; status: EventStatus; uploadEnabled: boolean; galleryEnabled: boolean };

export function EventControls({ eventId, status, uploadEnabled, galleryEnabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/admin/events/${eventId}`, { method: "PATCH", json: body });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const live = status === "active";
  const ended = status === "ended";

  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">Guest access</h2>
      <Toggle
        label="Event access"
        description={ended ? "Ended — guests can still view the gallery if enabled." : live ? "Guests with the QR code can open the event." : "Nobody can open the event right now."}
        checked={live || ended}
        disabled={busy || ended}
        onChange={(on) => void patch({ status: on ? "active" : "paused" })}
      />
      <Toggle label="Photo uploads" description={ended ? "Closed because the event has ended." : undefined} checked={uploadEnabled} disabled={busy || ended} onChange={(on) => void patch({ upload_enabled: on })} />
      <Toggle label="Shared gallery" description="Let guests see everyone's photos." checked={galleryEnabled} disabled={busy} onChange={(on) => void patch({ gallery_enabled: on })} />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="pt-2">
        {ended ? (
          <button className="btn-secondary btn-sm w-full" disabled={busy} onClick={() => void patch({ status: "active" })}>
            <Play size={16} /> Reopen event
          </button>
        ) : (
          <button
            className="btn-danger btn-sm w-full"
            disabled={busy}
            onClick={() => {
              if (confirm("End this event? Guests will no longer be able to upload. You can reopen it later.")) void patch({ status: "ended" });
            }}
          >
            <Flag size={16} /> End event
          </button>
        )}
      </div>
    </div>
  );
}

export function ReconcileButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn-secondary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          try {
            const { result } = await apiFetch<{ result: { checked: number; repaired: number; abandoned: number } }>(`/api/admin/events/${eventId}/reconcile`, { method: "POST" });
            setMsg(result.checked ? `Checked ${result.checked}: ${result.repaired} repaired, ${result.abandoned} marked failed.` : "Everything is in sync.");
            router.refresh();
          } catch (err) {
            setMsg(err instanceof ApiClientError ? err.message : "Sync failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <RotateCw size={15} className={busy ? "animate-spin" : ""} /> Sync with Drive
      </button>
      {msg && <span className="text-xs text-stone-600">{msg}</span>}
    </div>
  );
}
