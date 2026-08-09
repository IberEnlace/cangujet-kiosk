import type { DeviceAccessTokenResponse } from "../../../shared/deviceBootstrap";
import {
  DEVICE_ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY,
} from "./DeviceConfigurationService";

export const DEVICE_SESSION_INVALIDATED_EVENT = "morrow:device-session-invalidated";

export class DeviceTokenRefreshError extends Error {
  constructor(
    public readonly kind: "unavailable" | "protocol" | "forbidden",
    public readonly status: number,
  ) {
    super(kind === "unavailable"
      ? "The device session service is unavailable."
      : kind === "forbidden" ? "This device session is no longer authorized." : "The device session service returned an invalid response.");
    this.name = "DeviceTokenRefreshError";
  }
}

let refreshPromise: Promise<string | null> | null = null;

export function readDeviceAccessToken() {
  if (typeof sessionStorage === "undefined") return null;
  const current = sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  if (current) return current;
  const legacy = sessionStorage.getItem(LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  if (!legacy) return null;
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, legacy);
  sessionStorage.removeItem(LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  return legacy;
}

export function storeDeviceAccessToken(accessToken: string) {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, accessToken);
  sessionStorage.removeItem(LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY);
}

export function clearDeviceAccessToken() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY);
}

export function shareDeviceSessionRefresh(operation: () => Promise<string | null>) {
  if (refreshPromise) return refreshPromise;
  const current = operation();
  refreshPromise = current;
  void current.finally(() => {
    if (refreshPromise === current) refreshPromise = null;
  }).catch(() => undefined);
  return current;
}

export function refreshDeviceAccessToken(fetchImpl: typeof fetch = globalThis.fetch) {
  return shareDeviceSessionRefresh(async () => {
    let response: Response;
    try {
      response = await fetchImpl("/api/v1/devices/session/refresh", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
    } catch {
      throw new DeviceTokenRefreshError("unavailable", 503);
    }
    if (response.status === 401) {
      markDeviceSessionInvalid();
      return null;
    }
    if (response.status === 403) {
      markDeviceSessionInvalid();
      throw new DeviceTokenRefreshError("forbidden", 403);
    }
    if (!response.ok) throw new DeviceTokenRefreshError("unavailable", response.status >= 500 ? response.status : 503);
    let payload: unknown;
    try { payload = JSON.parse(await response.text()) as unknown; }
    catch { throw new DeviceTokenRefreshError("protocol", 502); }
    if (!isAccessTokenResponse(payload)) throw new DeviceTokenRefreshError("protocol", 502);
    storeDeviceAccessToken(payload.accessToken);
    return payload.accessToken;
  });
}

export function markDeviceSessionInvalid() {
  clearDeviceAccessToken();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEVICE_SESSION_INVALIDATED_EVENT));
}

export function onDeviceSessionInvalidated(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DEVICE_SESSION_INVALIDATED_EVENT, callback);
  return () => window.removeEventListener(DEVICE_SESSION_INVALIDATED_EVENT, callback);
}

function isAccessTokenResponse(value: unknown): value is DeviceAccessTokenResponse {
  return Boolean(value && typeof value === "object" && "accessToken" in value
    && typeof (value as DeviceAccessTokenResponse).accessToken === "string"
    && (value as DeviceAccessTokenResponse).accessToken.length > 0);
}
