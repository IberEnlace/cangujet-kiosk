import type {
  CreateActivationKeyRequest,
  CreateActivationKeyResponse,
  DeviceManagementSnapshot,
  ManagedDevice,
} from "../../../shared/deviceManagement";
import { getStaffAccessToken } from "../supabase/authService";

export const adminDeviceManagementService = {
  snapshot: () => request<DeviceManagementSnapshot>("/api/v1/admin/devices"),
  createKey: (input: CreateActivationKeyRequest) => request<CreateActivationKeyResponse>("/api/v1/admin/device-activation-keys", { method: "POST", body: input }),
  revokeKey: (keyId: string) => request<void>(`/api/v1/admin/device-activation-keys/${encodeURIComponent(keyId)}/revoke`, { method: "POST" }),
  updateDevice: (deviceId: string, input: { name?: string; status?: ManagedDevice["status"] }) => request<ManagedDevice>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`, { method: "PATCH", body: input }),
  revokeSessions: (deviceId: string) => request<void>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke-session`, { method: "POST" }),
  refreshConfiguration: (deviceId: string) => request<ManagedDevice>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/refresh-configuration`, { method: "POST" }),
};

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getStaffAccessToken();
  if (!token) throw new Error("A live Supabase administrator session is required for device management.");
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as { message?: string } : null;
  if (!response.ok) throw new Error(body?.message ?? "Device management request failed.");
  return body as T;
}
