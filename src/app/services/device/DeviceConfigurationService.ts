import type { KioskDeviceConfig } from "../../types/device";

export const DEVICE_CONFIG_STORAGE_KEY = "morrow:kiosk-device-config";
export const DEVICE_ACCESS_TOKEN_STORAGE_KEY = "morrow:kiosk-device-access-token";

export type DeviceRequestOptions = {
  signal?: AbortSignal;
};

export interface DeviceConfigurationService {
  configureDevice(secretKey: string, options?: DeviceRequestOptions): Promise<KioskDeviceConfig>;
  getSavedConfiguration(options?: DeviceRequestOptions): Promise<KioskDeviceConfig | null>;
  clearConfiguration(options?: DeviceRequestOptions): Promise<void>;
  heartbeat(configurationVersion: number, options?: DeviceRequestOptions): Promise<boolean>;
  isConfigurationValid(config: unknown): config is KioskDeviceConfig;
}
