import type { SupportedLanguage } from "../config/languages";
import type { OrderType } from "../context/CartContext";
import type { DeviceBootstrap } from "../../shared/deviceBootstrap";

export type DeviceStatus = "checking" | "unconfigured" | "connecting" | "configured" | "invalid_key" | "network_error" | "timeout" | "disabled" | "configuration_error";
export type DeviceInitializationStatus = "initializing" | "authenticated" | "setup_required" | "error";
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
}

export class DeviceConfigurationError extends Error {
  constructor(public readonly code: DeviceErrorStatus) {
    super(code);
    this.name = "DeviceConfigurationError";
  }
}
