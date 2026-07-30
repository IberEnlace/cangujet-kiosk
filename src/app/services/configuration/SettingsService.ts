import type { KioskDeviceConfig } from "../../types/device";
import type { KioskConfiguration, RuntimeConfiguration } from "../../types/bootstrap";
import { hasConfigurationChanged } from "./configurationVersion";

export class SettingsService {
  loadKiosk(config: KioskDeviceConfig): KioskConfiguration {
    return {
      ...config.bootstrap.device,
      idle: config.bootstrap.idleScreenConfiguration,
      payments: config.bootstrap.paymentConfiguration,
      ai: config.bootstrap.noriConfiguration,
    };
  }

  loadRuntime(config: KioskDeviceConfig): RuntimeConfiguration {
    return {
      ...config.bootstrap.configuration,
      menuId: config.bootstrap.publishedMenuId,
      menuVersion: config.bootstrap.publishedMenuVersion,
    };
  }

  refresh(config: KioskDeviceConfig) {
    return { kiosk: this.loadKiosk(config), configuration: this.loadRuntime(config) };
  }

  hasChanged(current: KioskDeviceConfig, next: KioskDeviceConfig) {
    return hasConfigurationChanged(current, next);
  }
}
