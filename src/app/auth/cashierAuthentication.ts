import { useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useDevice } from "../context/DeviceContext";
import { readDeviceAccessToken } from "../services/device/deviceTokenManager";
import type { DeviceInitializationStatus } from "../types/device";
import type { OrderAuthentication } from "../services/orders/OrderService";
import type { StaffRole } from "./roleConfig";

export type CashierAuthenticationStatus = "restoring" | "ready" | "unavailable";

export type CashierAuthentication = {
  mode: Extract<OrderAuthentication, "device" | "staff">;
  status: CashierAuthenticationStatus;
  ready: boolean;
  branchId: string | null;
  identityKey: string;
};

export type CashierAuthenticationInput = {
  deviceInitializationStatus: DeviceInitializationStatus;
  deviceId: string | null;
  deviceType: string | null;
  deviceBranchId: string | null;
  deviceAccessTokenAvailable: boolean;
  staffLoading: boolean;
  staffAuthenticated: boolean;
  staffRole: StaffRole | null;
  staffId: string | null;
  staffBranchId: string | null;
};

export function resolveCashierAuthentication(input: CashierAuthenticationInput): CashierAuthentication {
  const deviceRestoring = input.deviceInitializationStatus === "initializing"
    || input.deviceInitializationStatus === "registering";
  if (deviceRestoring) {
    return state("device", "restoring", input.deviceBranchId, `device:restoring:${input.deviceId ?? "unknown"}`);
  }
  const cashierDevice = input.deviceInitializationStatus === "authenticated"
    && input.deviceType === "cashier_terminal";
  if (cashierDevice) {
    return state(
      "device",
      input.deviceAccessTokenAvailable ? "ready" : "restoring",
      input.deviceBranchId,
      `device:${input.deviceId ?? "unknown"}:${input.deviceAccessTokenAvailable ? "ready" : "restoring"}`,
    );
  }
  if (input.staffLoading) {
    return state("device", "restoring", input.deviceBranchId, "staff:restoring");
  }
  if (input.staffAuthenticated && input.staffRole === "cashier") {
    return state("staff", "ready", input.staffBranchId, `staff:${input.staffId ?? "unknown"}`);
  }
  return state("device", "unavailable", input.deviceBranchId, "device:unavailable");
}

export function useCashierAuthentication() {
  const auth = useAuth();
  const device = useDevice();
  const deviceId = device.config?.deviceId ?? null;
  const deviceType = device.config?.bootstrap.device.type ?? null;
  const deviceBranchId = device.config?.branchId ?? null;
  const deviceAccessTokenAvailable = Boolean(readDeviceAccessToken());
  return useMemo(() => resolveCashierAuthentication({
    deviceInitializationStatus: device.initializationStatus,
    deviceId,
    deviceType,
    deviceBranchId,
    deviceAccessTokenAvailable,
    staffLoading: auth.isLoading,
    staffAuthenticated: auth.isAuthenticated,
    staffRole: auth.currentRole === "admin" || auth.currentRole === "cashier" || auth.currentRole === "kitchen" ? auth.currentRole : null,
    staffId: auth.profile?.id ?? null,
    staffBranchId: auth.profile?.branch_id ?? null,
  }), [
    auth.currentRole,
    auth.isAuthenticated,
    auth.isLoading,
    auth.profile?.branch_id,
    auth.profile?.id,
    device.initializationStatus,
    deviceAccessTokenAvailable,
    deviceBranchId,
    deviceId,
    deviceType,
  ]);
}

export function cashierQueriesMayRun(authentication: CashierAuthentication, blockedIdentity: string | null) {
  return authentication.ready
    && Boolean(authentication.branchId)
    && blockedIdentity !== authentication.identityKey;
}

function state(
  mode: CashierAuthentication["mode"],
  status: CashierAuthenticationStatus,
  branchId: string | null,
  identityKey: string,
): CashierAuthentication {
  return { mode, status, ready: status === "ready", branchId, identityKey };
}
