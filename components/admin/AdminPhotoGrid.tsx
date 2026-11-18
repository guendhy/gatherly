"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { formatBytes, formatRelative } from "@/lib/format";
import type { PhotoRow } from "@/lib/types";
import { StatusChip } from "./AdminShell";

export function AdminPhotoGrid({ photos }: { photos: PhotoRow[] }) {
  const [open, setOpen] = useState<PhotoRow | null>(null);
  const uploaded = photos.filter((p) => p.upload_status === "uploaded");
  const problems = photos.filter((p) => p.upload_status !== "uploaded");

  return (
    <>
      {uploaded.length === 0 ? (
        <p className="rounded-2xl bg-sage-50 px-4 py-8 text-center text-sm text-stone-600">No photos yet. Share the QR code to get started.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {uploaded.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="relative aspect-square overflow-hidden rounded-xl bg-sage-100" aria-label={`Open photo by ${p.guest_name ?? "guest"}`}>
              <img src={`/api/admin/photos/${p.id}/image?size=thumb`} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-sand">
          <table className="w-full text-left text-xs">
            <thead className="bg-sage-50 text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand bg-white">
              {problems.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <StatusChip status={p.upload_status} />
                  </td>
                  <td className="px-3 py-2">{p.guest_name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatBytes(p.file_size)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatRelative(p.created_at)}</td>
                  <td className="max-w-64 truncate px-3 py-2 text-stone-500" title={p.error_message ?? ""}>
                    {p.error_message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1410]/95 text-white" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="safe-top flex items-center justify-between gap-3 px-4 pb-2 text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="truncate font-semibold">{open.guest_name ?? "Guest"}</p>
              <p className="truncate text-white/60">
                {open.file_name} · {formatBytes(open.file_size)} · {new Date(open.uploaded_at ?? open.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <a href={`/api/admin/photos/${open.id}/image?download=1`} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Download">
                <Download size={20} />
              </a>
              <button onClick={() => setOpen(null)} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Close">
                <X size={22} />
              </button>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-2">
            <img src={`/api/admin/photos/${open.id}/image`} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}
