import type { KioskDeviceConfig } from "../../types/device";
import type { BranchConfiguration } from "../../types/bootstrap";
import { hasConfigurationChanged } from "./configurationVersion";

export class BranchConfigurationService {
  load(config: KioskDeviceConfig): BranchConfiguration {
    return config.bootstrap.branch;
  }

  refresh(config: KioskDeviceConfig) { return this.load(config); }
  hasChanged(current: KioskDeviceConfig, next: KioskDeviceConfig) {
    return hasConfigurationChanged(current, next);
  }
}
