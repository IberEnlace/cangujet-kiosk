import type { BootstrapDeviceType, DeviceActivationKeyVerificationResponse } from "../../../shared/deviceBootstrap";
import type { KioskDeviceConfig } from "../../types/device";

export const DEVICE_CONFIG_STORAGE_KEY = "morrow.deviceBootstrap.publicCache";
export const LEGACY_DEVICE_CONFIG_STORAGE_KEY = "morrow:kiosk-device-config";
export const DEVICE_ACCESS_TOKEN_STORAGE_KEY = "morrow.device.accessToken";
export const LEGACY_DEVICE_ACCESS_TOKEN_STORAGE_KEY = "morrow:kiosk-device-access-token";

export type DeviceRequestOptions = {
  signal?: AbortSignal;
};

export interface DeviceConfigurationService {
  verifyActivationKey(secretKey: string, options?: DeviceRequestOptions): Promise<DeviceActivationKeyVerificationResponse>;
  configureDevice(secretKey: string, deviceType?: BootstrapDeviceType, options?: DeviceRequestOptions): Promise<KioskDeviceConfig>;
  getSavedConfiguration(options?: DeviceRequestOptions): Promise<KioskDeviceConfig | null>;
  clearConfiguration(options?: DeviceRequestOptions): Promise<void>;
  heartbeat(configurationVersion: number, options?: DeviceRequestOptions): Promise<boolean>;
  isConfigurationValid(config: unknown): config is KioskDeviceConfig;
}
