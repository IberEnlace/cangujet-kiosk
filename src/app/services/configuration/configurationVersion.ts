import type { KioskDeviceConfig } from "../../types/device";

export function hasConfigurationChanged(current: KioskDeviceConfig, next: KioskDeviceConfig) {
  return current.configVersion !== next.configVersion
    || current.bootstrap.configuration.checksum !== next.bootstrap.configuration.checksum;
}
