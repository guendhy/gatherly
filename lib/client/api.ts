"use client";

export type ApiFailure = { status: number; code: string; message: string; retryAfter?: number };

export class ApiClientError extends Error implements ApiFailure {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

type ErrorJson = { error?: { code?: string; message?: string; details?: { retryAfter?: number } } };

function toError(status: number, json: ErrorJson | null): ApiClientError {
  return new ApiClientError(
    status,
    json?.error?.code ?? (status === 0 ? "network" : `http_${status}`),
    json?.error?.message ?? (status === 0 ? "You appear to be offline. Check your connection and try again." : "Something went wrong. Please try again."),
    json?.error?.details?.retryAfter,
  );
}

export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers as Record<string, string>) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw toError(0, null);
  }
  const body = (await res.json().catch(() => null)) as (T & ErrorJson) | null;
  if (!res.ok) throw toError(res.status, body);
  return body as T;
}

/** XHR-based upload so we can report progress (fetch can't on iOS Safari). */
export function uploadWithProgress<T>(url: string, form: FormData, opts: { onProgress?: (fraction: number) => void; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.timeout = opts.timeoutMs ?? 90_000;
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.min(0.99, e.loaded / e.total));
    };
    xhr.onload = () => {
      let json: (T & ErrorJson) | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON (e.g. platform 413 page) */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve(json as T);
      } else if (xhr.status === 413 && !json) {
        reject(new ApiClientError(413, "file_too_large", "That photo is too large to upload. Please try another one."));
      } else {
        reject(toError(xhr.status, json));
      }
    };
    xhr.onerror = () => reject(toError(0, null));
    xhr.ontimeout = () => reject(new ApiClientError(0, "timeout", "The upload took too long — your connection may be slow. Your photo is saved here; tap Try again."));
    xhr.onabort = () => reject(new ApiClientError(0, "aborted", "Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
