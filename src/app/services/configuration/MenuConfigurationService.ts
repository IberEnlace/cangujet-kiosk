import type { NormalizedMenu } from "../supabase/menuModels";
import { getLocalMenu, loadMenu } from "../supabase/menuService";
import type { CachedMenuConfiguration } from "../../types/bootstrap";
import {
  readMenuConfigurationCache,
  writeMenuConfigurationCache,
} from "./configurationCache";

export type MenuConfigurationResult =
  | { ok: true; menu: NormalizedMenu; source: "network" | "cache" | "development"; offline: boolean; stale: boolean }
  | { ok: false; code: "menu_failed" | "category_failed" | "offline" | "expired_configuration"; message: string };

export class MenuConfigurationService {
  async load(input: {
    deviceId: string;
    menuId: string;
    menuVersion: number;
    configVersion: number;
    currency: string;
    force?: boolean;
    signal?: AbortSignal;
  }): Promise<MenuConfigurationResult> {
    const cached = readMenuConfigurationCache(input.deviceId, input.menuId);
    if (!input.force && this.isCurrent(cached, input)) {
      return { ok: true, menu: cached!.menu, source: "cache", offline: false, stale: false };
    }

    const result = await loadMenu({
      force: input.force,
      signal: input.signal,
      expected: { menuId: input.menuId, menuVersion: input.menuVersion, currency: input.currency },
    });
    if (result.ok) {
      const value: CachedMenuConfiguration = {
        deviceId: input.deviceId,
        menuId: input.menuId,
        menuVersion: input.menuVersion,
        configVersion: input.configVersion,
        cachedAt: new Date().toISOString(),
        menu: result.data,
      };
      writeMenuConfigurationCache(value);
      return { ok: true, menu: result.data, source: result.source === "local" ? "development" : "network", offline: false, stale: false };
    }
    if (cached) {
      return {
        ok: true,
        menu: cached.menu,
        source: "cache",
        offline: true,
        stale: cached.menuVersion !== input.menuVersion || cached.configVersion !== input.configVersion,
      };
    }
    if (import.meta.env?.DEV) {
      return { ok: true, menu: getLocalMenu(), source: "development", offline: true, stale: true };
    }
    const code = result.error.code === "invalid_data"
      ? "category_failed"
      : result.error.code === "network" ? "offline" : "menu_failed";
    return { ok: false, code, message: result.error.message };
  }

  isCurrent(
    cached: CachedMenuConfiguration | null,
    expected: { menuVersion: number; configVersion: number },
  ) {
    return cached !== null
      && cached.menuVersion === expected.menuVersion
      && cached.configVersion === expected.configVersion;
  }
}
