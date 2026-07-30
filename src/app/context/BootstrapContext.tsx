import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  BootstrapErrorCode,
  BootstrapLoadState,
  BranchConfiguration,
  KioskConfiguration,
  RestaurantConfiguration,
  RuntimeConfiguration,
} from "../types/bootstrap";
import type { NormalizedMenu } from "../services/supabase/menuModels";
import { replaceAiMenu } from "../data/aiMenu";
import { BranchConfigurationService } from "../services/configuration/BranchConfigurationService";
import { MenuConfigurationService } from "../services/configuration/MenuConfigurationService";
import { RestaurantConfigurationService } from "../services/configuration/RestaurantConfigurationService";
import { SettingsService } from "../services/configuration/SettingsService";
import { useDevice } from "./DeviceContext";
import type { KioskDeviceConfig } from "../types/device";

const MAX_OFFLINE_CONFIGURATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const restaurantService = new RestaurantConfigurationService();
const branchService = new BranchConfigurationService();
const settingsService = new SettingsService();
const menuService = new MenuConfigurationService();
const appliedThemeProperties = new Set<string>();

type BootstrapContextValue = {
  state: BootstrapLoadState;
  restaurant: RestaurantConfiguration | null;
  branch: BranchConfiguration | null;
  kiosk: KioskConfiguration | null;
  configuration: RuntimeConfiguration | null;
  featureFlags: Record<string, boolean>;
  menu: NormalizedMenu | null;
  offline: boolean;
  stale: boolean;
  error: { code: BootstrapErrorCode; message: string } | null;
  refresh(): Promise<void>;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const device = useDevice();
  const [menu, setMenu] = useState<NormalizedMenu | null>(null);
  const [state, setState] = useState<BootstrapLoadState>("waiting_for_device");
  const [error, setError] = useState<BootstrapContextValue["error"]>(null);
  const [offlineMenu, setOfflineMenu] = useState(false);
  const [staleMenu, setStaleMenu] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const config = device.config;
  const snapshot = useMemo(() => config ? createBootstrapSnapshot(config) : null, [config]);
  const restaurant = snapshot?.restaurant ?? null;
  const branch = snapshot?.branch ?? null;
  const kiosk = snapshot?.kiosk ?? null;
  const configuration = snapshot?.configuration ?? null;

  useEffect(() => {
    if (!config || device.initializationStatus !== "authenticated") {
      setMenu(null);
      setState("waiting_for_device");
      setError(null);
      return;
    }
    const activeConfig = config;
    const controller = new AbortController();
    setState("loading_configuration");
    setError(null);
    applyTheme(activeConfig.bootstrap.restaurant.brandColors);
    setState("loading_menu");
    void menuService.load({
      deviceId: activeConfig.deviceId,
      menuId: activeConfig.publishedMenuId,
      menuVersion: activeConfig.bootstrap.publishedMenuVersion,
      configVersion: activeConfig.configVersion,
      currency: activeConfig.currency,
      force: refreshAttempt > 0,
      signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setMenu(null);
        setOfflineMenu(false);
        setStaleMenu(false);
        setError({ code: result.code, message: result.message });
        setState("error");
        return;
      }
      setMenu(result.menu);
      replaceAiMenu(result.menu.products);
      setOfflineMenu(result.offline);
      setStaleMenu(result.stale);
      setState(activeConfig.offline || result.offline ? "offline" : "ready");
    });
    return () => controller.abort();
  }, [
    config,
    device.initializationStatus,
    refreshAttempt,
  ]);

  const refresh = useCallback(async () => {
    setState("loading_configuration");
    setError(null);
    await device.reloadConfiguration();
    setRefreshAttempt(value => value + 1);
  }, [device]);

  const configurationExpired = Boolean(config?.offline)
    && Date.now() - Date.parse(config?.configuredAt ?? "") > MAX_OFFLINE_CONFIGURATION_AGE_MS;
  const value = useMemo<BootstrapContextValue>(() => ({
    state: configurationExpired ? "error" : state,
    restaurant,
    branch,
    kiosk,
    configuration,
    featureFlags: kiosk?.featureFlags ?? {},
    menu,
    offline: Boolean(config?.offline) || offlineMenu,
    stale: configurationExpired || staleMenu,
    error: configurationExpired
      ? { code: "expired_configuration", message: "The cached restaurant configuration is older than seven days." }
      : error,
    refresh,
  }), [
    branch,
    config?.offline,
    configuration,
    configurationExpired,
    error,
    kiosk,
    menu,
    offlineMenu,
    refresh,
    restaurant,
    staleMenu,
    state,
  ]);

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  const context = useContext(BootstrapContext);
  if (!context) throw new Error("useBootstrap must be used within BootstrapProvider");
  return context;
}

export function useRestaurant() { return useBootstrap().restaurant; }
export function useBranch() { return useBootstrap().branch; }
export function useKiosk() { return useBootstrap().kiosk; }

export function createBootstrapSnapshot(config: KioskDeviceConfig) {
  return {
    restaurant: restaurantService.load(config),
    branch: branchService.load(config),
    kiosk: settingsService.loadKiosk(config),
    configuration: settingsService.loadRuntime(config),
    featureFlags: settingsService.loadKiosk(config).featureFlags,
  };
}

function applyTheme(tokens: Record<string, string | number | boolean | null>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const property of appliedThemeProperties) root.style.removeProperty(property);
  appliedThemeProperties.clear();
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    setThemeProperty(root, `--restaurant-${toKebabCase(name)}`, String(value));
  }
  const primary = firstString(tokens, ["primary", "primaryColor", "accent", "accentColor"]);
  const foreground = firstString(tokens, ["primaryForeground", "onPrimary"]);
  if (primary) {
    setThemeProperty(root, "--primary", primary);
    setThemeProperty(root, "--ring", primary);
    setThemeProperty(root, "--lime", primary);
    setThemeProperty(root, "--admin-field-accent", primary);
  }
  if (foreground) setThemeProperty(root, "--primary-foreground", foreground);
}

function toKebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
}

function firstString(tokens: Record<string, string | number | boolean | null>, names: string[]) {
  for (const name of names) if (typeof tokens[name] === "string") return tokens[name] as string;
  return null;
}

function setThemeProperty(root: HTMLElement, property: string, value: string) {
  root.style.setProperty(property, value);
  appliedThemeProperties.add(property);
}
