import {
  getStaffSessionCredential,
  invalidateStaffSession,
  refreshStaffSessionCredential,
} from "./supabase/authService";

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

export type StaffApiDependencies = {
  getCredential: typeof getStaffSessionCredential;
  refreshCredential: typeof refreshStaffSessionCredential;
  invalidateSession: typeof invalidateStaffSession;
  fetcher: typeof fetch;
};

const defaultDependencies: StaffApiDependencies = {
  getCredential: getStaffSessionCredential,
  refreshCredential: refreshStaffSessionCredential,
  invalidateSession: invalidateStaffSession,
  fetcher: (input, init) => globalThis.fetch(input, init),
};

export async function staffApiRequest<T>(
  path: string,
  options: StaffRequestOptions = {},
  dependencies: StaffApiDependencies = defaultDependencies,
): Promise<T> {
  const { body, headers, ...requestOptions } = options;
  const credential = await dependencies.getCredential();
  let token = credential.token;
  if (!token) {
    if (credential.failure === "network") {
      logRequest(path, "network_error", false, true);
      throw new StaffApiError("network", "The staff session could not be checked because the authentication service is unreachable.", 0, "authentication_unreachable");
    }
    logRequest(path, 401, false, true);
    await dependencies.invalidateSession();
    throw new StaffApiError("unauthenticated", "Your staff session has expired. Sign in again.", 401, "missing_staff_session");
  }

  let response = await sendStaffRequest(path, token, body, headers, requestOptions, dependencies.fetcher);
  if (response.status === 401) {
    const refreshed = await dependencies.refreshCredential();
    if (refreshed.token) {
      token = refreshed.token;
      response = await sendStaffRequest(path, token, body, headers, requestOptions, dependencies.fetcher);
    } else if (refreshed.failure === "network") {
      throw new StaffApiError("network", "The staff session could not be refreshed because the authentication service is unreachable.", 0, "authentication_unreachable");
    } else {
      throw new StaffApiError("unauthenticated", "Your staff session has expired. Sign in again.", 401, "invalid_staff_session");
    }
  }

  const payload = await readPayload(response);
  const failure = errorPayload(payload);
  if (response.status === 401) {
    await dependencies.invalidateSession();
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

async function sendStaffRequest(
  path: string,
  token: string,
  body: unknown,
  headers: HeadersInit | undefined,
  requestOptions: Omit<StaffRequestOptions, "body" | "headers">,
  fetcher: typeof fetch,
) {
  try {
    const response = await fetcher(path, {
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
    logRequest(path, response.status, true, true);
    return response;
  } catch (error) {
    logRequest(path, "network_error", true, true);
    throw new StaffApiError(
      "network",
      "The Admin API is unreachable. Check the network and try again.",
      0,
      error instanceof Error ? error.name : undefined,
    );
  }
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
  console.debug("[cangujet staff API]", { url, status, authorizationAttached, credentialsIncluded });
}
