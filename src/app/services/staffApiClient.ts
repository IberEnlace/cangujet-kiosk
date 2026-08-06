import { getStaffSessionCredential, invalidateStaffSession } from "./supabase/authService";

export type StaffApiFailureKind = "unauthenticated" | "forbidden" | "network" | "server" | "request" | "protocol";

export class StaffApiError extends Error {
  constructor(
    public readonly kind: StaffApiFailureKind,
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "StaffApiError";
  }
}

type StaffRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
};

type ErrorPayload = { code?: string; message?: string; error?: string };

export async function staffApiRequest<T>(path: string, options: StaffRequestOptions = {}): Promise<T> {
  const { body, headers, ...requestOptions } = options;
  const credential = await getStaffSessionCredential();
  const token = credential.token;
  const credentialsAttached = Boolean(token);
  if (!token) {
    if (credential.failure === "network") {
      logRequest(path, "network_error", false, true);
      throw new StaffApiError("network", "The staff session could not be checked because the authentication service is unreachable.", 0, "authentication_unreachable");
    }
    logRequest(path, 401, false, true);
    await invalidateStaffSession();
    throw new StaffApiError("unauthenticated", "Your staff session has expired. Sign in again.", 401, "missing_staff_session");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...requestOptions,
      method: requestOptions.method ?? "GET",
      credentials: "include",
      cache: requestOptions.cache ?? "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    logRequest(path, "network_error", credentialsAttached, true);
    throw new StaffApiError(
      "network",
      "The Admin API is unreachable. Check the network and try again.",
      0,
      error instanceof Error ? error.name : undefined,
    );
  }

  logRequest(path, response.status, credentialsAttached, true);
  const payload = await readPayload(response);
  const failure = errorPayload(payload);
  if (response.status === 401) {
    await invalidateStaffSession();
    throw new StaffApiError("unauthenticated", failure?.message ?? "Your staff session has expired. Sign in again.", 401, failure?.code);
  }
  if (response.status === 403) {
    throw new StaffApiError("forbidden", failure?.message ?? "You do not have permission to perform this Admin action.", 403, failure?.code);
  }
  if (response.status >= 500) {
    throw new StaffApiError("server", failure?.message ?? "The Admin service is temporarily unavailable.", response.status, failure?.code);
  }
  if (!response.ok) {
    throw new StaffApiError("request", failure?.message ?? failure?.error ?? "The Admin request could not be completed.", response.status, failure?.code);
  }
  if (response.status === 204) return undefined as T;
  if (payload === null) throw new StaffApiError("protocol", "The Admin service returned an invalid response.", 502, "invalid_response");
  return payload as T;
}

export function isStaffApiError(error: unknown): error is StaffApiError {
  return error instanceof StaffApiError;
}

async function readPayload(response: Response): Promise<ErrorPayload | Record<string, unknown> | unknown[] | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text) as ErrorPayload | Record<string, unknown> | unknown[]; }
  catch { return null; }
}

function errorPayload(payload: unknown): ErrorPayload | null {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as ErrorPayload : null;
}

function logRequest(url: string, status: number | "network_error", authorizationAttached: boolean, credentialsIncluded: boolean) {
  if (!import.meta.env?.DEV) return;
  console.debug("[MORROW staff API]", { url, status, authorizationAttached, credentialsIncluded });
}
