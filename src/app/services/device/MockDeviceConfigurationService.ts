import { isSupportedLanguage } from "../../config/languages";
import { isOrderType } from "../../config/serviceOptions";
import { DeviceConfigurationError, type DevicePaymentMethod, type KioskDeviceConfig } from "../../types/device";
import { DEVICE_CONFIG_STORAGE_KEY, type DeviceConfigurationService } from "./DeviceConfigurationService";

const VALID_KEYS = new Set(["MORROW-DEMO-001", "MORROW-KIOSK-IST-01"]);
const PAYMENT_METHODS: DevicePaymentMethod[] = ["card", "pay_at_cashier", "qr"];
const delay = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const hasStrings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === "string" && value[key] !== "");

export class MockDeviceConfigurationService implements DeviceConfigurationService {
  async configureDevice(secretKey: string): Promise<KioskDeviceConfig> {
    await delay(650);
    if (secretKey === "MORROW-DISABLED-001") throw new DeviceConfigurationError("disabled");
    if (secretKey === "MORROW-NETWORK-001") throw new DeviceConfigurationError("network_error");
    if (!VALID_KEYS.has(secretKey)) throw new DeviceConfigurationError("invalid_key");
    const now = new Date().toISOString();
    return {
      deviceId: "device-ist-001", kioskId: "kiosk-ist-01", kioskName: "Morrow Downtown Kiosk 01",
      branchId: "branch-ist-downtown", branchName: "Istanbul Branch", restaurantId: "morrow-restaurant-01",
      restaurantName: "MORROW", currency: "EUR", locale: "en-TR", timezone: "Europe/Istanbul", menuVersion: "2026.07",
      settings: { enabledLanguages: ["en", "tr", "ar"], defaultLanguage: "en", allowedOrderTypes: ["dine_in", "take_away"], allowedPaymentMethods: PAYMENT_METHODS, receiptPrintingEnabled: true, aiAssistantEnabled: true, voiceAssistantEnabled: true },
      configuredAt: now,
    };
  }

  isConfigurationValid(value: unknown): value is KioskDeviceConfig {
    if (!isRecord(value) || !hasStrings(value, ["deviceId", "kioskId", "kioskName", "branchId", "branchName", "restaurantId", "restaurantName", "currency", "locale", "timezone", "configuredAt"])) return false;
    if (!isRecord(value.settings)) return false;
    const settings = value.settings;
    return Array.isArray(settings.enabledLanguages) && settings.enabledLanguages.length > 0 && settings.enabledLanguages.every(item => typeof item === "string" && isSupportedLanguage(item))
      && typeof settings.defaultLanguage === "string" && isSupportedLanguage(settings.defaultLanguage) && settings.enabledLanguages.includes(settings.defaultLanguage)
      && Array.isArray(settings.allowedOrderTypes) && settings.allowedOrderTypes.length > 0 && settings.allowedOrderTypes.every(item => typeof item === "string" && isOrderType(item))
      && Array.isArray(settings.allowedPaymentMethods) && settings.allowedPaymentMethods.length > 0 && settings.allowedPaymentMethods.every(item => PAYMENT_METHODS.includes(item as DevicePaymentMethod))
      && typeof settings.receiptPrintingEnabled === "boolean" && typeof settings.aiAssistantEnabled === "boolean"
      && (settings.voiceAssistantEnabled === undefined || typeof settings.voiceAssistantEnabled === "boolean");
  }

  getSavedConfiguration(): KioskDeviceConfig | null {
    try { const raw = localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY); if (!raw) return null; const parsed: unknown = JSON.parse(raw); return this.isConfigurationValid(parsed) ? parsed : null; } catch { return null; }
  }
  saveConfiguration(config: KioskDeviceConfig) { if (!this.isConfigurationValid(config)) throw new DeviceConfigurationError("configuration_error"); localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, JSON.stringify(config)); }
  clearConfiguration() { localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY); }
}
