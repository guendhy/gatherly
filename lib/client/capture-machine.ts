/** Pure state machine for the guest capture screen (unit-tested; no browser APIs). */

export type CapturedPhoto = { id: string; blob: Blob; url: string };

export type CaptureState =
  | { phase: "start"; notice?: string }
  | { phase: "live" }
  | { phase: "processing" }
  | { phase: "preview"; photo: CapturedPhoto; source: "camera" | "file" }
  | { phase: "uploading"; photo: CapturedPhoto; source: "camera" | "file"; progress: number }
  | { phase: "success"; photo: CapturedPhoto; duplicate: boolean }
  | { phase: "error"; photo: CapturedPhoto; source: "camera" | "file"; message: string; retryable: boolean };

export type CaptureAction =
  | { type: "CAMERA_STARTED" }
  | { type: "CAMERA_CLOSED"; notice?: string }
  | { type: "PROCESSING" }
  | { type: "PROCESS_FAILED"; message: string }
  | { type: "PHOTO_READY"; photo: CapturedPhoto; source: "camera" | "file" }
  | { type: "RETAKE" }
  | { type: "UPLOAD_START" }
  | { type: "UPLOAD_PROGRESS"; progress: number }
  | { type: "UPLOAD_OK"; duplicate: boolean }
  | { type: "UPLOAD_FAILED"; message: string; retryable: boolean }
  | { type: "RESET" };

export const initialCaptureState: CaptureState = { phase: "start" };

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case "CAMERA_STARTED":
      return { phase: "live" };
    case "CAMERA_CLOSED":
      return state.phase === "live" ? { phase: "start", notice: action.notice } : state;
    case "PROCESSING":
      return { phase: "processing" };
    case "PROCESS_FAILED":
      return { phase: "start", notice: action.message };
    case "PHOTO_READY":
      return { phase: "preview", photo: action.photo, source: action.source };
    case "RETAKE":
      return state.phase === "preview" || state.phase === "error" ? { phase: "start" } : state;
    case "UPLOAD_START":
      if (state.phase === "preview" || state.phase === "error") return { phase: "uploading", photo: state.photo, source: state.source, progress: 0 };
      return state; // ignore double taps while uploading
    case "UPLOAD_PROGRESS":
      return state.phase === "uploading" ? { ...state, progress: Math.max(state.progress, action.progress) } : state;
    case "UPLOAD_OK":
      return state.phase === "uploading" ? { phase: "success", photo: state.photo, duplicate: action.duplicate } : state;
    case "UPLOAD_FAILED":
      return state.phase === "uploading" ? { phase: "error", photo: state.photo, source: state.source, message: action.message, retryable: action.retryable } : state;
    case "RESET":
      return { phase: "start" };
  }
}

/** Which upload failures are worth a "Try again" (same photo) vs. needing a different photo. */
export function isRetryableUploadError(status: number, code: string): boolean {
  if (status === 0) return true; // offline / timeout
  if (status === 409 || status === 429) return true;
  if (status >= 500) return true;
  if (code === "session_required" || code === "event_closed" || code === "uploads_disabled") return false;
  return false; // 400/413/415 etc.
}
