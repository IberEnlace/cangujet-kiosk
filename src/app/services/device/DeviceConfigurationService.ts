import type { KioskDeviceConfig } from "../../types/device";

export const DEVICE_CONFIG_STORAGE_KEY = "morrow:kiosk-device-config";
export const DEVICE_ACCESS_TOKEN_STORAGE_KEY = "morrow:kiosk-device-access-token";

export interface DeviceConfigurationService {
  configureDevice(secretKey: string): Promise<KioskDeviceConfig>;
  getSavedConfiguration(): Promise<KioskDeviceConfig | null>;
  clearConfiguration(): Promise<void>;
  isConfigurationValid(config: unknown): config is KioskDeviceConfig;
}
