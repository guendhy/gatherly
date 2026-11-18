import { NextResponse, type NextRequest } from "next/server";

/** An error that is safe to show to the caller. `message` must never contain secrets. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Raised when required environment variables are missing or malformed. Lists names only, never values. */
export class ConfigError extends ApiError {
  constructor(public readonly missing: string[], hint?: string) {
    super(503, "not_configured", hint ?? "This Gatherly site is not fully configured yet.", { missing });
    this.name = "ConfigError";
  }
}

export type ErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } };

export function errorResponse(err: unknown, init?: { headers?: HeadersInit }): NextResponse<ErrorBody> {
  if (err instanceof ApiError) {
    // Missing-variable names are only useful to the host; keep them out of guest responses.
    const details = err instanceof ConfigError ? undefined : err.details;
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(details ? { details } : {}) } },
      { status: err.status, headers: init?.headers },
    );
  }
  console.error("[gatherly] unhandled error", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
    { status: 500, headers: init?.headers },
  );
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler so thrown ApiErrors become structured JSON responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
