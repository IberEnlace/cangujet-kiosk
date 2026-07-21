import type { SupportedLanguage } from "../config/languages";
import type { OrderType } from "../context/CartContext";

export type DeviceStatus = "checking" | "unconfigured" | "connecting" | "configured" | "invalid_key" | "network_error" | "disabled" | "configuration_error";
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
  settings: KioskSettings;
  configuredAt: string;
}

export class DeviceConfigurationError extends Error {
  constructor(public readonly code: Exclude<DeviceStatus, "checking" | "unconfigured" | "connecting" | "configured">) {
    super(code);
    this.name = "DeviceConfigurationError";
  }
}
