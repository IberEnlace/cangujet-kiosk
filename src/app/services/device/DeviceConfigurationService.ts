import type { KioskDeviceConfig } from "../../types/device";

export const DEVICE_CONFIG_STORAGE_KEY = "morrow:kiosk-device-config";

export interface DeviceConfigurationService {
  configureDevice(secretKey: string): Promise<KioskDeviceConfig>;
  getSavedConfiguration(): KioskDeviceConfig | null;
  saveConfiguration(config: KioskDeviceConfig): void;
  clearConfiguration(): void;
  isConfigurationValid(config: unknown): config is KioskDeviceConfig;
}
