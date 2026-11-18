"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { AlertTriangle, Check, Copy, Download, ExternalLink, RefreshCcw, Share2 } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";

type Access = { url: string | null; code: string | null; expiresAt: string | null; createdAt: string | null };

export function QrPanel({ eventId, eventName, dateLabel, initial }: { eventId: string; eventName: string; dateLabel: string | null; initial: Access }) {
  const router = useRouter();
  const [access, setAccess] = useState(initial);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expiry, setExpiry] = useState("");
  const qrRef = useRef<HTMLCanvasElement>(null);

  async function copy(text: string, which: "url" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Couldn't copy — long-press the text to copy it instead.");
    }
  }

  async function share() {
    if (!access.url) return;
    if (navigator.share) {
      await navigator.share({ title: eventName, text: `Share your photos from ${eventName}`, url: access.url }).catch(() => undefined);
    } else {
      void copy(access.url, "url");
    }
  }

  /** Printable PNG: QR + event name + code on an ivory card. */
  function downloadPng() {
    const qr = qrRef.current;
    if (!qr) return;
    const W = 1200;
    const H = 1600;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const sans = `${css.getPropertyValue("--font-dm-sans").trim() || "system-ui"}, sans-serif`;
    const serif = `${css.getPropertyValue("--font-playfair").trim() || "Georgia"}, Georgia, serif`;
    const host = access.url ? new URL(access.url).host : "";
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#cdb27a";
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.textAlign = "center";
    ctx.fillStyle = "#94763f";
    ctx.font = `600 34px ${sans}`;
    ctx.fillText("✦  SCAN · SNAP · SHARE  ✦", W / 2, 170);
    ctx.fillStyle = "#263d33";
    let size = 84;
    ctx.font = `600 ${size}px ${serif}`;
    while (ctx.measureText(eventName).width > W - 200 && size > 40) {
      size -= 4;
      ctx.font = `600 ${size}px ${serif}`;
    }
    ctx.fillText(eventName, W / 2, 290);
    if (dateLabel) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 36px ${sans}`;
      ctx.fillText(dateLabel, W / 2, 350);
    }
    const qrSize = 760;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect((W - qrSize) / 2 - 30, 410, qrSize + 60, qrSize + 60);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, (W - qrSize) / 2, 440, qrSize, qrSize);
    ctx.fillStyle = "#263d33";
    ctx.font = `600 44px ${sans}`;
    ctx.fillText("Point your phone camera here", W / 2, 1300);
    if (access.code) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 32px ${sans}`;
      ctx.fillText(`or go to ${host} → Open Event → ${access.code}`, W / 2, 1370);
    }
    ctx.fillStyle = "#94ad88";
    ctx.font = `800 40px ${sans}`;
    ctx.fillText("✳ gatherly.", W / 2, 1490);
    const a = document.createElement("a");
    a.download = `${eventName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }

  async function regenerate() {
    if (!confirm("Generate a new QR code and event code? Any QR codes you've already printed or shared will stop working.")) return;
    setBusy(true);
    setError("");
    try {
      const body = { expiresAt: expiry ? new Date(expiry).toISOString() : null };
      const res = await apiFetch<{ access: Access }>(`/api/admin/events/${eventId}/qr`, { method: "POST", json: body });
      setAccess(res.access);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not regenerate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card flex flex-col items-center p-6 text-center">
        {access.url ? (
          <>
            <p className="kicker">Scan · Snap · Share</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-ink">{eventName}</h2>
            <div className="mt-5 rounded-3xl bg-white p-4 shadow-soft">
              <QRCodeCanvas ref={qrRef} value={access.url} size={512} level="M" marginSize={2} fgColor="#263d33" bgColor="#ffffff" style={{ width: 240, height: 240 }} />
            </div>
            {access.code && (
              <p className="mt-4 text-sm text-stone-600">
                Event code: <span className="font-mono text-base font-semibold tracking-widest text-ink">{access.code}</span>
              </p>
            )}
            <div className="mt-6 grid w-full grid-cols-2 gap-2">
              <button className="btn-primary btn-sm col-span-2" onClick={downloadPng}>
                <Download size={16} /> Download PNG
              </button>
              <button className="btn-secondary btn-sm" onClick={() => void share()}>
                <Share2 size={16} /> Share
              </button>
              <a className="btn-secondary btn-sm" href={access.url} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open
              </a>
            </div>
          </>
        ) : (
          <div className="py-10">
            <AlertTriangle className="mx-auto text-gold-500" />
            <p className="mt-3 text-sm text-stone-600">No active QR code for this event. Generate one to let guests in.</p>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {access.url && (
          <div className="card p-5">
            <label className="label">Guest link</label>
            <div className="flex gap-2">
              <input readOnly value={access.url} className="input truncate font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn-secondary shrink-0 px-4" onClick={() => void copy(access.url!, "url")} aria-label="Copy event URL">
                {copied === "url" ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            {access.code && (
              <>
                <label className="label mt-4">Event code</label>
                <div className="flex gap-2">
                  <input readOnly value={access.code} className="input font-mono tracking-widest" />
                  <button className="btn-secondary shrink-0 px-4" onClick={() => void copy(access.code!, "code")} aria-label="Copy event code">
                    {copied === "code" ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-stone-500">Guests can type this on the Gatherly homepage under “Open Event”.</p>
              </>
            )}
            <p className="mt-4 text-xs text-stone-500">
              {access.expiresAt ? `Expires ${new Date(access.expiresAt).toLocaleString()}.` : "Never expires (until you regenerate it or end the event)."}
            </p>
          </div>
        )}

        <div className="card p-5">
          <h3 className="font-serif text-lg font-semibold text-ink">{access.url ? "Regenerate QR code" : "Generate QR code"}</h3>
          <p className="mt-1 text-sm text-stone-600">Use this if a QR code was shared somewhere it shouldn&apos;t be. The old QR and code stop working immediately.</p>
          <label htmlFor="expiry" className="label mt-4">
            Expires <span className="font-normal tracking-normal text-stone-400 normal-case">(optional)</span>
          </label>
          <input id="expiry" type="datetime-local" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button className={`${access.url ? "btn-danger" : "btn-primary"} btn-sm mt-4`} onClick={() => void regenerate()} disabled={busy}>
            <RefreshCcw size={16} /> {busy ? "Generating…" : access.url ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
