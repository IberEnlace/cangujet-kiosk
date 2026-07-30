import type { KioskDeviceConfig } from "../../types/device";
import type { RestaurantConfiguration } from "../../types/bootstrap";
import { hasConfigurationChanged } from "./configurationVersion";

export class RestaurantConfigurationService {
  load(config: KioskDeviceConfig): RestaurantConfiguration {
    return {
      ...config.bootstrap.restaurant,
      timezone: config.bootstrap.branch.timezone,
      currency: config.bootstrap.branch.currency,
      languages: config.bootstrap.languages,
    };
  }

  refresh(config: KioskDeviceConfig) { return this.load(config); }
  hasChanged(current: KioskDeviceConfig, next: KioskDeviceConfig) {
    return hasConfigurationChanged(current, next);
  }
}
