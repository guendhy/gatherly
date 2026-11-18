"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";

export type EventFormValues = {
  event_name: string;
  description: string;
  event_date: string;
  cover_image_url: string;
  upload_enabled: boolean;
  gallery_enabled: boolean;
};

export function EventForm({ mode, eventId, initial }: { mode: "create" | "edit"; eventId?: string; initial?: Partial<EventFormValues> }) {
  const router = useRouter();
  const [v, setV] = useState<EventFormValues>({
    event_name: initial?.event_name ?? "",
    description: initial?.description ?? "",
    event_date: initial?.event_date ?? "",
    cover_image_url: initial?.cover_image_url ?? "",
    upload_enabled: initial?.upload_enabled ?? true,
    gallery_enabled: initial?.gallery_enabled ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof EventFormValues>(k: K, value: EventFormValues[K]) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [k]: value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      event_name: v.event_name.trim(),
      description: v.description.trim() || null,
      event_date: v.event_date || null,
      upload_enabled: v.upload_enabled,
      gallery_enabled: v.gallery_enabled,
      ...(mode === "create" || v.cover_image_url !== (initial?.cover_image_url ?? "") ? { cover_image_url: v.cover_image_url.trim() || null } : {}),
    };
    try {
      if (mode === "create") {
        const res = await apiFetch<{ event: { id: string } }>("/api/admin/events", { method: "POST", json: payload });
        router.push(`/admin/events/${res.event.id}/qr?created=1`);
        router.refresh();
        return;
      }
      await apiFetch(`/api/admin/events/${eventId}`, { method: "PATCH", json: payload });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7">
      <div>
        <label htmlFor="name" className="label">
          Event name
        </label>
        <input id="name" className="input" required maxLength={120} placeholder="e.g. Nelfa's 30th Birthday" value={v.event_name} onChange={(e) => set("event_name", e.target.value)} />
      </div>
      <div>
        <label htmlFor="date" className="label">
          Event date
        </label>
        <input id="date" type="date" className="input" value={v.event_date} onChange={(e) => set("event_date", e.target.value)} />
      </div>
      <div>
        <label htmlFor="desc" className="label">
          Welcome message <span className="font-normal tracking-normal text-stone-400 normal-case">(optional)</span>
        </label>
        <textarea id="desc" className="input min-h-28" maxLength={1000} placeholder="Thank you for celebrating with us! Snap away and share your favourite moments." value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div>
        <label htmlFor="cover" className="label">
          Cover image URL <span className="font-normal tracking-normal text-stone-400 normal-case">(optional — or upload one in Settings)</span>
        </label>
        <input id="cover" type="url" inputMode="url" className="input" placeholder="https://…" value={v.cover_image_url} onChange={(e) => set("cover_image_url", e.target.value)} />
      </div>
      <fieldset className="space-y-3">
        <legend className="label">Guest features</legend>
        <Toggle label="Guests can upload photos" checked={v.upload_enabled} onChange={(c) => set("upload_enabled", c)} />
        <Toggle label="Guests can view the shared gallery" checked={v.gallery_enabled} onChange={(c) => set("gallery_enabled", c)} />
      </fieldset>
      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !v.event_name.trim()}>
          {mode === "create" ? <Sparkles size={18} /> : <Save size={18} />}
          {busy ? "Saving…" : mode === "create" ? "Create event & QR code" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-sage-700">Saved ✓</span>}
      </div>
    </form>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border border-sand bg-white px-4 py-3 ${disabled ? "opacity-60" : ""}`}>
      <span>
        <span className="block text-sm font-medium text-charcoal">{label}</span>
        {description && <span className="block text-xs text-stone-500">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-stone-300 transition peer-checked:bg-sage-600 peer-focus-visible:ring-4 peer-focus-visible:ring-sage-200" />
        <span className="absolute top-1 left-1 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
