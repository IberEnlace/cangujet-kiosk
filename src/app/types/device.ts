import type { SupportedLanguage } from "../config/languages";
import type { OrderType } from "../context/CartContext";
import type { DeviceBootstrap } from "../../shared/deviceBootstrap";

export type DeviceStatus = "checking" | "unconfigured" | "connecting" | "configured" | "invalid_request" | "invalid_key" | "network_error" | "timeout" | "session_expired" | "disabled" | "expired" | "revoked" | "already_used" | "conflict" | "server_error" | "protocol_error" | "configuration_error";
export type DeviceInitializationStatus = "not_required" | "initializing" | "registering" | "authenticated" | "setup_required" | "error";
export type DeviceLifecycleState = "initializing" | "unconfigured" | "activating" | "active" | "token_expired" | "revoked" | "offline" | "failed";
export type DeviceErrorStatus = Exclude<DeviceStatus, "checking" | "unconfigured" | "connecting" | "configured">;
export type DevicePaymentMethod = "card" | "pay_at_cashier" | "qr";

export interface KioskSettings {
  enabledLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
  allowedOrderTypes: OrderType[];
  allowedPaymentMethods: DevicePaymentMethod[];
  receiptPrintingEnabled: boolean;
  aiAssistantEnabled: boolean;
  voiceAssistantEnabled?: boolean;
}

export interface KioskDeviceConfig {
  bootstrap: DeviceBootstrap;
  deviceId: string;
  kioskId: string;
  kioskName: string;
  branchId: string;
  branchName: string;
  restaurantId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  timezone: string;
  menuVersion?: string;
  publishedMenuId: string;
  configVersion: number;
  theme: DeviceBootstrap["theme"];
  logoUrl: string | null;
  taxRate: number;
  openingHours: DeviceBootstrap["openingHours"];
  paymentConfiguration: DeviceBootstrap["paymentConfiguration"];
  noriConfiguration: DeviceBootstrap["noriConfiguration"];
  idleScreenConfiguration: DeviceBootstrap["idleScreenConfiguration"];
  realtimeConfiguration: DeviceBootstrap["realtimeConfiguration"];
  settings: KioskSettings;
  configuredAt: string;
  offline: boolean;
}

export class DeviceConfigurationError extends Error {
  constructor(public readonly code: DeviceErrorStatus) {
    super(code);
    this.name = "DeviceConfigurationError";
  }
}
