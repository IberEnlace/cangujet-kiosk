import type { BootstrapDeviceType } from "../../shared/deviceBootstrap";
import type { DeviceInitializationStatus } from "../types/device";
import {
  LEGACY_WORKSPACE_SELECTION_ROUTES,
  ROUTES,
  WORKSPACE_SELECTION_ROUTE,
  type AppRoute,
  type DeviceMode,
} from "./roleConfig";

export const WORKSPACE_SELECTION_OVERRIDE_KEY = "morrow.workspace.selectionOverride";

export function beginIntentionalWorkspaceSelection() {
  sessionStorage.setItem(WORKSPACE_SELECTION_OVERRIDE_KEY, "true");
}

export function completeIntentionalWorkspaceSelection() {
  sessionStorage.removeItem(WORKSPACE_SELECTION_OVERRIDE_KEY);
}

export function isWorkspaceSelectionOverrideActive() {
  return sessionStorage.getItem(WORKSPACE_SELECTION_OVERRIDE_KEY) === "true";
}

export function isLegacyWorkspaceSelectionRoute(path: string) {
  return LEGACY_WORKSPACE_SELECTION_ROUTES.includes(path as typeof LEGACY_WORKSPACE_SELECTION_ROUTES[number]);
}

export function workspaceRouteForDevice(type: BootstrapDeviceType): AppRoute {
  if (type === "cashier_terminal") return ROUTES.cashier;
  if (type === "kitchen_display") return ROUTES.kitchen;
  if (type === "order_display") return ROUTES.display;
  if (type === "admin_terminal") return ROUTES.adminLogin;
  return ROUTES.idle;
}

export function initialWorkspaceResumeDecision(input: {
  route: AppRoute;
  initializationStatus: DeviceInitializationStatus;
  assignedDeviceType: BootstrapDeviceType | null;
  selectionOverrideActive: boolean;
}) {
  if (input.route !== WORKSPACE_SELECTION_ROUTE) return { resolved: true, target: null, reason: "different_route" } as const;
  if (input.selectionOverrideActive) return { resolved: true, target: null, reason: "selection_override" } as const;
  if (["initializing", "registering"].includes(input.initializationStatus)) {
    return { resolved: false, target: null, reason: "device_initializing" } as const;
  }
  if (input.initializationStatus === "authenticated" && input.assignedDeviceType) {
    return { resolved: true, target: workspaceRouteForDevice(input.assignedDeviceType), reason: "initial_device_resume" } as const;
  }
  return { resolved: true, target: null, reason: "no_saved_workspace" } as const;
}

export function workspaceNavigationDiagnostic(input: {
  route: string;
  persistedWorkspace: DeviceMode | BootstrapDeviceType | null;
  selectionOverrideActive: boolean;
  redirectSource: string;
  redirectAllowed: boolean;
}) {
  if (import.meta.env?.DEV) console.info("[MORROW workspace navigation]", input);
}
