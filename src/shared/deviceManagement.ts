import type { BootstrapDeviceType } from "./deviceBootstrap";

export type SafeActivationKey = {
  id: string;
  restaurantId: string;
  branchId: string;
  deviceType: BootstrapDeviceType;
  deviceName: string;
  keyHint: string;
  status: "active" | "used" | "expired" | "revoked";
  activationPolicy: "one_time" | "reusable";
  expiresAt: string | null;
  maxActivations: number;
  activationCount: number;
  createdAt: string;
  revokedAt: string | null;
};

export type ManagedDevice = {
  id: string;
  restaurantId: string;
  branchId: string;
  deviceType: BootstrapDeviceType;
  name: string;
  status: "pending" | "active" | "disabled" | "retired" | "revoked";
  configVersion: number;
  lastSeenAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  appVersion: string | null;
  connectionHealth: "unknown" | "online" | "degraded" | "offline";
};

export type ManagedBranch = { id: string; restaurantId: string; name: string; code: string; active: boolean };
export type DeviceManagementSnapshot = { branches: ManagedBranch[]; keys: SafeActivationKey[]; devices: ManagedDevice[] };

export type CreateActivationKeyRequest = {
  branchId: string;
  deviceType: BootstrapDeviceType;
  deviceName: string;
  expiresAt?: string | null;
  activationPolicy: "one_time" | "reusable";
  maxActivations: number;
};

export type CreateActivationKeyResponse = { key: SafeActivationKey; secretKey: string };
