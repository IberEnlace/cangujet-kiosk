import type { DeviceBootstrap } from "../../shared/deviceBootstrap";
import type { NormalizedMenu } from "../services/supabase/menuModels";

export type BootstrapLoadState =
  | "waiting_for_device"
  | "loading_configuration"
  | "loading_menu"
  | "ready"
  | "offline"
  | "error";

export type BootstrapErrorCode =
  | "bootstrap_failed"
  | "configuration_failed"
  | "menu_failed"
  | "category_failed"
  | "offline"
  | "expired_configuration";

export type RestaurantConfiguration = DeviceBootstrap["restaurant"] & {
  timezone: string;
  currency: string;
  languages: DeviceBootstrap["languages"];
};

export type BranchConfiguration = DeviceBootstrap["branch"];

export type KioskConfiguration = DeviceBootstrap["device"] & {
  idle: DeviceBootstrap["idleScreenConfiguration"];
  payments: DeviceBootstrap["paymentConfiguration"];
  ai: DeviceBootstrap["noriConfiguration"];
};

export type RuntimeConfiguration = DeviceBootstrap["configuration"] & {
  menuId: string;
  menuVersion: number;
};

export type CachedMenuConfiguration = {
  deviceId: string;
  menuId: string;
  menuVersion: number;
  configVersion: number;
  cachedAt: string;
  menu: NormalizedMenu;
};
