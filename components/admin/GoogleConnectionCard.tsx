"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CloudCog, Unplug } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

type Storage = { connected: boolean; source: "oauth" | "env" | null; email: string | null; status: string | null; lastError: string | null; scope: string | null; connectedAt: string | null };

export function GoogleConnectionCard({ storage, oauthConfigured, flash }: { storage: Storage; oauthConfigured: boolean; flash: { kind: "ok" | "error"; text: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fullScope = storage.scope?.includes("auth/drive ") || storage.scope?.endsWith("auth/drive");

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sage-100 text-sage-700">
          <CloudCog size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-semibold text-ink">Google Drive</h2>
          <p className="text-sm text-stone-600">Guest photos are uploaded to your Google Drive, in a private folder per event.</p>
        </div>
      </div>

      {flash && (
        <p role="status" className={`mt-4 rounded-2xl px-4 py-3 text-sm ${flash.kind === "ok" ? "bg-sage-100 text-sage-900" : "bg-red-50 text-red-800"}`}>
          {flash.text}
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-sand bg-white p-4 text-sm">
        {storage.status === "error" ? (
          <p className="flex gap-2 text-red-700">
            <AlertTriangle size={18} className="shrink-0" /> Connection needs attention: Google no longer accepts the saved authorization. Reconnect below.
          </p>
        ) : storage.connected ? (
          <div className="flex gap-2 text-sage-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Connected{storage.email ? ` as ${storage.email}` : ""}</p>
              <p className="text-xs text-stone-500">
                {storage.source === "env" ? "Using the legacy refresh-token environment variable from Gatherly v1. Connect below to switch to the in-app connection." : `Permission: ${fullScope ? "full Drive access" : "only files and folders created by Gatherly"}.`}
                {storage.connectedAt ? ` Since ${new Date(storage.connectedAt).toLocaleDateString()}.` : ""}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-stone-600">Not connected. Guests can&apos;t upload photos until you connect a Google account.</p>
        )}
      </div>

      {!oauthConfigured ? (
        <p className="mt-4 text-sm text-stone-600">
          Add your Google OAuth client ID and client secret to the Vercel environment variables first (see the Setup status list below and README → Google Cloud setup), then redeploy.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/admin/google/connect" className="btn-primary btn-sm">
            {storage.connected && storage.source === "oauth" ? "Reconnect / switch account" : "Connect Google Drive"}
          </a>
          {storage.source === "oauth" && (
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Disconnect Google Drive? Guests won't be able to upload until you reconnect. Existing photos stay in your Drive.")) return;
                setBusy(true);
                await apiFetch("/api/admin/google", { method: "DELETE" }).catch(() => undefined);
                setBusy(false);
                router.refresh();
              }}
            >
              <Unplug size={16} /> Disconnect
            </button>
          )}
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        If your Google Cloud OAuth app is in <strong>Testing</strong> mode, Google expires the connection after 7 days — reconnect before each event, or publish the app (Google may require verification).
      </p>
    </div>
  );
}
