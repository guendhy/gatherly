"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Download, Heart, RefreshCw, X } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import type { GalleryPhoto } from "@/lib/types";

type Page = { photos: GalleryPhoto[]; nextCursor: string | null };

export function Gallery({ slug, uploadsOpen }: { slug: string; uploadsOpen: boolean }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (reset: boolean, from: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError("");
      try {
        const qs = new URLSearchParams({ limit: "24", ...(from && !reset ? { cursor: from } : {}) });
        const page = await apiFetch<Page>(`/api/events/${slug}/photos?${qs}`);
        setPhotos((prev) => {
          if (reset) return page.photos;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.photos.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Couldn't load the gallery.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    void load(true, null);
  }, [load]);

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore) void load(false, cursor);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore, load]);

  // lightbox keyboard nav
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, photos.length]);

  const touchX = useRef<number | null>(null);
  const current = index !== null ? photos[index] : null;

  return (
    <div className="flex flex-1 flex-col px-4 pt-5 pb-2">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-[26px] font-semibold text-ink">Memory wall</h2>
          <p className="text-sm text-stone-500">{loading ? "Loading moments…" : `${photos.length}${cursor ? "+" : ""} shared ${photos.length === 1 ? "moment" : "moments"}`}</p>
        </div>
        <button onClick={() => void load(true, null)} className="grid size-11 place-items-center rounded-full border border-sand bg-white text-ink hover:bg-sage-50" aria-label="Refresh gallery" disabled={loading}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{" "}
          <button className="font-semibold underline" onClick={() => void load(true, null)}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-square rounded-2xl" />
          ))}
        </div>
      ) : photos.length === 0 && !error ? (
        <div className="flex flex-col items-center rounded-3xl bg-sage-50 px-6 py-16 text-center">
          <Heart size={36} className="text-sage-400" />
          <h3 className="mt-4 font-serif text-2xl font-semibold text-ink">The story starts with you</h3>
          <p className="mt-1 text-sm text-stone-600">No photos yet — be the first to share one!</p>
          {uploadsOpen && (
            <Link href={`/e/${slug}/capture`} className="btn-primary mt-6">
              <Camera size={18} /> Take the first photo
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p, i) => (
              <button key={p.id} onClick={() => setIndex(i)} className="group relative aspect-square overflow-hidden rounded-2xl bg-sage-100" aria-label={`Open photo${p.guestName ? ` by ${p.guestName}` : ""}`}>
                <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-2 text-left text-[11px] leading-tight text-white">
                  <span className="block truncate font-semibold">{p.guestName ?? "Guest"}</span>
                  <span className="opacity-80">{formatRelative(p.uploadedAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <div ref={sentinel} className="h-1" />
          {cursor && (
            <button className="btn-secondary mx-auto mt-5" onClick={() => void load(false, cursor)} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}

      {uploadsOpen && photos.length > 0 && (
        <Link href={`/e/${slug}/capture`} className="btn-primary safe-bottom sticky bottom-4 mx-auto mt-6 shadow-lift">
          <Camera size={18} /> Add a photo
        </Link>
      )}

      {current && index !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#0b1410]/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            if (start == null || end == null) return;
            if (end - start > 60) setIndex(Math.max(0, index - 1));
            if (start - end > 60) setIndex(Math.min(photos.length - 1, index + 1));
          }}
        >
          <div className="safe-top flex items-center justify-between px-4 pb-2">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{current.guestName ?? "Guest"}</p>
              <p className="text-white/60">{new Date(current.uploadedAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <a href={current.downloadUrl} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Download photo">
                <Download size={20} />
              </a>
              <button onClick={() => setIndex(null)} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Close viewer">
                <X size={22} />
              </button>
            </div>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2" onClick={() => setIndex(null)}>
            <img key={current.id} src={current.fullUrl} alt={`Photo by ${current.guestName ?? "a guest"}`} className="max-h-full max-w-full animate-fade-up object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="safe-bottom flex items-center justify-between px-4 pt-3">
            <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} className="grid size-12 place-items-center rounded-full bg-white/15 disabled:opacity-30" aria-label="Previous photo">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm text-white/70 tabular-nums">
              {index + 1} / {photos.length}
            </span>
            <button
              onClick={() => {
                if (index + 1 >= photos.length && cursor) void load(false, cursor);
                setIndex(Math.min(photos.length - 1, index + 1));
              }}
              disabled={index >= photos.length - 1 && !cursor}
              className="grid size-12 place-items-center rounded-full bg-white/15 disabled:opacity-30"
              aria-label="Next photo"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
