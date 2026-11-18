"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AlertCircle, Camera, Check, CloudUpload, ImagePlus, Images, RefreshCw, RotateCcw, SwitchCamera, WifiOff, X } from "lucide-react";
import { ApiClientError, uploadWithProgress } from "@/lib/client/api";
import { captureReducer, initialCaptureState, isRetryableUploadError, type CapturedPhoto } from "@/lib/client/capture-machine";
import { drawToJpeg, newUploadId, preparePhoto } from "@/lib/client/image";
import { listPending, removePending, savePending, type PendingPhoto } from "@/lib/client/pending-store";

type Props = { slug: string; eventName: string; galleryEnabled: boolean; maxBytes: number };

const NAME_KEY = "gatherly-guest-name";

export function CaptureFlow({ slug, eventName, galleryEnabled, maxBytes }: Props) {
  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [guestName, setGuestName] = useState("");
  const [cameraSupported, setCameraSupported] = useState(true);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [online, setOnline] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const guestNameRef = useRef("");
  const targetBytes = Math.max(512 * 1024, maxBytes - 96 * 1024);

  useEffect(() => {
    guestNameRef.current = guestName;
  }, [guestName]);

  // ---- setup
  useEffect(() => {
    setCameraSupported(Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext);
    setOnline(navigator.onLine);
    try {
      setGuestName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* storage blocked */
    }
    void listPending(slug).then(setPending);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [slug]);

  // ---- camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && streamRef.current) {
        stopCamera();
        dispatch({ type: "CAMERA_CLOSED" });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stopCamera]);

  const startCamera = useCallback(
    async (mode: "environment" | "user" = facing) => {
      stopCamera();
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraSupported(false);
        cameraInputRef.current?.click();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: mode }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        });
        streamRef.current = stream;
        dispatch({ type: "CAMERA_STARTED" });
      } catch (err) {
        const name = (err as DOMException).name;
        const notice =
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was not allowed. You can enable it in Settings › Safari › Camera, or use “Phone camera” below."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found. Use “Choose from library” below."
              : "The camera couldn't start. Use “Phone camera” below instead.";
        dispatch({ type: "PROCESS_FAILED", message: notice });
      }
    },
    [facing, stopCamera],
  );

  // attach stream once the <video> is mounted
  useEffect(() => {
    if (state.phase === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [state.phase]);

  function flipCamera() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void startCamera(next);
  }

  function closeCamera() {
    stopCamera();
    dispatch({ type: "CAMERA_CLOSED" });
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    dispatch({ type: "PROCESSING" });
    try {
      const blob = await drawToJpeg(video, video.videoWidth, video.videoHeight, targetBytes, facing === "user");
      stopCamera();
      ready(blob, "camera");
    } catch {
      stopCamera();
      dispatch({ type: "PROCESS_FAILED", message: "We couldn't capture that photo. Please try again." });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    dispatch({ type: "PROCESSING" });
    try {
      ready(await preparePhoto(file, targetBytes), "file");
    } catch (err) {
      dispatch({ type: "PROCESS_FAILED", message: (err as Error).message });
    }
  }

  function ready(blob: Blob, source: "camera" | "file", id = newUploadId()) {
    const photo: CapturedPhoto = { id, blob, url: URL.createObjectURL(blob) };
    dispatch({ type: "PHOTO_READY", photo, source });
  }

  // revoke preview URLs when we move on
  const photoUrl = "photo" in state ? state.photo.url : null;
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  function retake() {
    const source = "source" in state ? state.source : "camera";
    dispatch({ type: "RETAKE" });
    if (source === "camera" && cameraSupported) void startCamera();
  }

  // ---- upload
  const uploadingRef = useRef(false);
  const upload = useCallback(
    async (photo: CapturedPhoto) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      dispatch({ type: "UPLOAD_START" });
      const name = guestNameRef.current.trim().slice(0, 60);
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        /* ignore */
      }
      // Persist first, so the photo survives a dropped connection or closed tab.
      await savePending({ id: photo.id, eventSlug: slug, blob: photo.blob, guestName: name, createdAt: Date.now() });

      const form = new FormData();
      form.append("photo", photo.blob, `${photo.id}.jpg`);
      form.append("clientUploadId", photo.id);
      if (name) form.append("guestName", name);

      for (let attempt = 0; ; attempt++) {
        try {
          if (!navigator.onLine) throw new ApiClientError(0, "offline", "You're offline. Your photo is saved on this phone — tap Try again when you're connected.");
          const res = await uploadWithProgress<{ duplicate: boolean }>(`/api/events/${slug}/photos`, form, {
            timeoutMs: 90_000,
            onProgress: (p) => dispatch({ type: "UPLOAD_PROGRESS", progress: p }),
          });
          await removePending(photo.id);
          setPending((list) => list.filter((p) => p.id !== photo.id));
          dispatch({ type: "UPLOAD_OK", duplicate: Boolean(res?.duplicate) });
          break;
        } catch (err) {
          const e = err instanceof ApiClientError ? err : new ApiClientError(0, "unknown", "Upload failed. Please try again.");
          // A previous attempt is still finishing on the server — wait and retry the same upload id.
          if (e.code === "upload_in_progress" && attempt < 4) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          // Keep the photo on the phone for anything that a retry (or a fresh QR scan) can fix.
          const retryable = isRetryableUploadError(e.status, e.code) || e.code === "session_required";
          if (!retryable) await removePending(photo.id);
          const message =
            e.code === "session_required" ? "Your event session has expired. Please scan the event QR code again — then retry." : e.code === "rate_limited" ? "You're uploading very quickly! Please wait a minute and try again." : e.message;
          dispatch({ type: "UPLOAD_FAILED", message, retryable });
          break;
        }
      }
      uploadingRef.current = false;
    },
    [slug],
  );

  // auto-retry when the connection comes back
  useEffect(() => {
    if (online && state.phase === "error" && state.retryable && /offline|connection/i.test(state.message)) void upload(state.photo);
  }, [online, state, upload]);

  function resumePending(p: PendingPhoto) {
    setGuestName(p.guestName);
    guestNameRef.current = p.guestName;
    const photo: CapturedPhoto = { id: p.id, blob: p.blob, url: URL.createObjectURL(p.blob) };
    dispatch({ type: "PHOTO_READY", photo, source: "file" });
    setPending((list) => list.filter((x) => x.id !== p.id));
    void upload(photo);
  }

  async function discardPending(p: PendingPhoto) {
    await removePending(p.id);
    setPending((list) => list.filter((x) => x.id !== p.id));
  }

  // ---- render
  const hiddenInputs = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </>
  );

  if (state.phase === "live") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="safe-top flex items-center justify-between px-4 pb-2">
          <button onClick={closeCamera} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Close camera">
            <X size={22} />
          </button>
          <span className="max-w-[60%] truncate text-sm font-medium text-white/80">{eventName}</span>
          <span className="size-11" />
        </div>
        <div className="relative flex-1 overflow-hidden">
          <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
        </div>
        <div className="safe-bottom flex items-center justify-around px-8 pt-6">
          <button onClick={() => libraryInputRef.current?.click()} className="grid size-12 place-items-center rounded-full bg-white/15" aria-label="Choose from library">
            <ImagePlus size={22} />
          </button>
          <button onClick={() => void shoot()} className="grid size-[84px] place-items-center rounded-full border-4 border-white active:scale-95" aria-label="Take photo">
            <span className="size-[66px] rounded-full bg-white" />
          </button>
          <button onClick={flipCamera} className="grid size-12 place-items-center rounded-full bg-white/15" aria-label="Switch camera">
            <SwitchCamera size={22} />
          </button>
        </div>
        {hiddenInputs}
      </div>
    );
  }

  if (state.phase === "processing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24" role="status">
        <span className="size-10 animate-spin rounded-full border-[3px] border-sage-200 border-t-sage-700" />
        <p className="text-stone-600">Preparing your photo…</p>
        {hiddenInputs}
      </div>
    );
  }

  if (state.phase === "preview" || state.phase === "uploading" || state.phase === "error") {
    const uploading = state.phase === "uploading";
    return (
      <div className="flex flex-1 flex-col px-4 pt-4 pb-2">
        <div className="relative overflow-hidden rounded-3xl bg-sage-900 shadow-lift">
          <img src={state.photo.url} alt="Your photo preview" className="max-h-[58dvh] w-full object-contain" />
          {uploading && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-white">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2">
                  <CloudUpload size={16} /> {state.progress >= 0.99 ? "Saving to the album…" : "Uploading…"}
                </span>
                <span className="tabular-nums">{Math.round(state.progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}>
                <div className="h-full rounded-full bg-gold-300 transition-[width] duration-300" style={{ width: `${Math.max(4, state.progress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {state.phase === "error" && (
          <div role="alert" className="mt-4 flex gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {online ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <WifiOff size={18} className="mt-0.5 shrink-0" />}
            <span>{state.message}</span>
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="guest-name" className="label">
            Your name <span className="font-normal tracking-normal text-stone-400 normal-case">(optional)</span>
          </label>
          <input id="guest-name" className="input" placeholder="e.g. Maria" maxLength={60} value={guestName} disabled={uploading} onChange={(e) => setGuestName(e.target.value)} autoComplete="given-name" />
        </div>

        <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
          <button className="btn-secondary px-5" onClick={retake} disabled={uploading}>
            <RotateCcw size={18} /> Retake
          </button>
          {state.phase === "error" && state.retryable ? (
            <button className="btn-primary" onClick={() => void upload(state.photo)}>
              <RefreshCw size={18} /> Try again
            </button>
          ) : (
            <button className="btn-primary" onClick={() => void upload(state.photo)} disabled={uploading || state.phase === "error"}>
              <CloudUpload size={19} /> {uploading ? "Uploading…" : "Upload photo"}
            </button>
          )}
        </div>
        {hiddenInputs}
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div className="flex flex-1 flex-col items-center px-6 pt-10 pb-4 text-center">
        <div className="relative">
          <img src={state.photo.url} alt="" className="size-40 rotate-[-3deg] rounded-3xl border-[6px] border-white object-cover shadow-lift" />
          <span className="absolute -right-3 -bottom-3 grid size-14 animate-pop place-items-center rounded-full bg-sage-600 text-white shadow-lift">
            <Check size={30} strokeWidth={3} />
          </span>
        </div>
        <h2 className="mt-8 animate-fade-up font-serif text-3xl font-semibold text-ink">{state.duplicate ? "Already saved!" : "Moment saved!"}</h2>
        <p className="mt-2 max-w-xs text-[15px] text-stone-600">{state.duplicate ? "This photo was already in the event album." : "Your photo is now in the event album. Thank you for sharing!"}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <button
            className="btn-primary py-4"
            onClick={() => {
              dispatch({ type: "RESET" });
              if (cameraSupported) void startCamera();
            }}
          >
            <Camera size={19} /> Take another photo
          </button>
          {galleryEnabled && (
            <Link href={`/e/${slug}/gallery`} className="btn-secondary">
              <Images size={18} /> View gallery
            </Link>
          )}
        </div>
        {hiddenInputs}
      </div>
    );
  }

  // phase: start
  return (
    <div className="flex flex-1 flex-col px-5 pt-6 pb-2">
      {pending.length > 0 && (
        <div className="mb-5 rounded-2xl border border-gold-300 bg-gold-100 p-4 text-sm text-gold-600">
          <p className="font-semibold text-charcoal">
            {pending.length === 1 ? "1 photo hasn't finished uploading" : `${pending.length} photos haven't finished uploading`}
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-gold btn-sm" onClick={() => resumePending(pending[0]!)}>
              Upload now
            </button>
            <button className="btn-ghost btn-sm" onClick={() => void discardPending(pending[0]!)}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="relative flex h-[44dvh] min-h-60 flex-col items-center justify-center overflow-hidden rounded-[32px] bg-[radial-gradient(ellipse_at_center,var(--color-sage-100),var(--color-sage-200))] text-center">
        <div className="grid size-24 place-items-center rounded-full bg-white/70 text-sage-700 shadow-soft">
          <Camera size={42} strokeWidth={1.5} />
        </div>
        <h2 className="mt-6 font-serif text-[28px] font-semibold text-ink">Ready for your close-up?</h2>
        <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-sage-800/80">Snap a photo and share the magic of {eventName}.</p>
        <p aria-hidden className="mt-5 text-sage-400">
          ✧ ✦ ✧
        </p>
      </div>

      {state.notice && (
        <p role="alert" className="mt-4 rounded-2xl bg-gold-100 px-4 py-3 text-sm text-charcoal">
          {state.notice}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {cameraSupported ? (
          <button className="btn-primary py-5 text-base" onClick={() => void startCamera()}>
            <Camera size={21} /> Open camera
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <button className={cameraSupported ? "btn-secondary px-3" : "btn-primary col-span-2 py-5"} onClick={() => cameraInputRef.current?.click()}>
            <Camera size={18} /> Phone camera
          </button>
          <button className={cameraSupported ? "btn-secondary px-3" : "btn-secondary col-span-2"} onClick={() => libraryInputRef.current?.click()}>
            <ImagePlus size={18} /> From library
          </button>
        </div>
      </div>
      {!online && (
        <p className="mt-4 inline-flex items-center justify-center gap-2 text-sm text-stone-500">
          <WifiOff size={15} /> You&apos;re offline — photos will wait on your phone until you reconnect.
        </p>
      )}
      <p className="mt-5 text-center text-xs leading-relaxed text-stone-400">Photos go to the host&apos;s private Google Drive album. No account needed.</p>
      {hiddenInputs}
    </div>
  );
}
