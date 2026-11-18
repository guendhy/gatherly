"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound, X } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import { parseInvite } from "@/lib/client/invite";

export function OpenEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = parseInvite(value, window.location.origin);
    if (!parsed) {
      setError("Paste the full invitation link, or type the 8-character event code.");
      return;
    }
    if (parsed.kind === "link") {
      router.push(parsed.path);
      return;
    }
    setBusy(true);
    try {
      const { slug } = await apiFetch<{ slug: string }>("/api/access", { method: "POST", json: { code: parsed.code } });
      router.push(`/e/${slug}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setOpen(true)}>
        <KeyRound size={18} /> Open Event
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="open-event-title" onClick={() => !busy && setOpen(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="safe-bottom w-full max-w-md animate-fade-up rounded-t-[28px] bg-ivory p-6 text-left shadow-lift sm:rounded-[28px]">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 id="open-event-title" className="font-serif text-2xl font-semibold text-ink">
                  Open your event
                </h2>
                <p className="mt-1 text-sm text-stone-600">Paste your invitation link or enter the event code from your host.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="-mt-1 -mr-2 grid size-10 place-items-center rounded-full text-stone-500 hover:bg-sage-100" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <label className="label" htmlFor="invite">
              Invitation link or event code
            </label>
            <input
              ref={inputRef}
              id="invite"
              className="input"
              placeholder="e.g. K7PQ-M9XA"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={500}
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || !value.trim()}>
              {busy ? "Checking…" : "Continue"} <ArrowRight size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
