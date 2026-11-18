"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, QrCode } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";

/**
 * Shown when a guest has no valid session for this event. If the URL carries
 * a QR token it is exchanged for an httpOnly session cookie, then the token is
 * removed from the address bar. Otherwise the guest can type the event code.
 */
export function EventGate({ slug, token }: { slug: string; token: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "form">(token ? "checking" : "form");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiFetch(`/api/events/${slug}/session`, { method: "POST", json: { token } })
      .then(() => {
        router.replace(`/e/${slug}`);
        router.refresh();
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "We couldn't open this event. Please try again.");
        setPhase("form");
      });
  }, [slug, token, router]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch<{ slug: string }>("/api/access", { method: "POST", json: { code } });
      router.replace(`/e/${res.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code didn't work.");
      setBusy(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-24 text-center" role="status">
        <span className="size-10 animate-spin rounded-full border-[3px] border-sage-200 border-t-sage-700" />
        <p className="text-stone-600">Opening your event…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-6 grid size-20 place-items-center rounded-full bg-sage-100 text-sage-700">
        <QrCode size={34} strokeWidth={1.6} />
      </div>
      <h2 className="font-serif text-3xl font-semibold text-ink">Join the event</h2>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-stone-600">
        Scan the QR code at the event with your phone camera, or enter the event code your host shared.
      </p>
      {error && (
        <p role="alert" className="mt-5 max-w-sm rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={submitCode} className="mt-7 w-full max-w-xs text-left">
        <label htmlFor="code" className="label">
          Event code
        </label>
        <input
          id="code"
          className="input text-center font-mono text-lg tracking-[0.2em] uppercase"
          placeholder="ABCD-2345"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn-primary mt-4 w-full" disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 8}>
          {busy ? "Checking…" : "Join event"} <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
