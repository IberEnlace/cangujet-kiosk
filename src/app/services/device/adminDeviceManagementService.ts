import type {
  CreateActivationKeyRequest,
  CreateActivationKeyResponse,
  DeviceManagementSnapshot,
  ManagedDevice,
} from "../../../shared/deviceManagement";
import { staffApiRequest } from "../staffApiClient";

export const adminDeviceManagementService = {
  snapshot: () => staffApiRequest<DeviceManagementSnapshot>("/api/v1/admin/devices"),
  createKey: (input: CreateActivationKeyRequest) => staffApiRequest<CreateActivationKeyResponse>("/api/v1/admin/device-activation-keys", { method: "POST", body: input }),
  revokeKey: (keyId: string) => staffApiRequest<void>(`/api/v1/admin/device-activation-keys/${encodeURIComponent(keyId)}/revoke`, { method: "POST" }),
  updateDevice: (deviceId: string, input: { name?: string; status?: ManagedDevice["status"] }) => staffApiRequest<ManagedDevice>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}`, { method: "PATCH", body: input }),
  revokeSessions: (deviceId: string) => staffApiRequest<void>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke-session`, { method: "POST" }),
  refreshConfiguration: (deviceId: string) => staffApiRequest<ManagedDevice>(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/refresh-configuration`, { method: "POST" }),
};
