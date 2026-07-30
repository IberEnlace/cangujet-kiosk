import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SupabaseDeviceConfigurationService } from "../services/device/SupabaseDeviceConfigurationService";
import { DeviceConfigurationError, type DeviceStatus, type KioskDeviceConfig } from "../types/device";

interface DeviceContextValue {
  status: DeviceStatus;
  config: KioskDeviceConfig | null;
  configureDevice(secretKey: string): Promise<boolean>;
  clearDeviceConfiguration(): Promise<void>;
  reloadConfiguration(): Promise<void>;
}

const CONFIGURATION_POLL_INTERVAL_MS = 60_000;
const service = new SupabaseDeviceConfigurationService();
const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KioskDeviceConfig | null>(null);
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const initializationStartedRef = useRef(false);

  useEffect(() => {
    if (initializationStartedRef.current) return;
    initializationStartedRef.current = true;
    let active = true;
    void service.getSavedConfiguration().then(saved => {
      if (!active) return;
      setConfig(saved);
      setStatus(saved ? "configured" : "unconfigured");
    }).catch(error => {
      if (!active) return;
      setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error");
    });
    return () => { active = false; };
  }, []);

  const reloadConfiguration = useCallback(async () => {
    try {
      const next = await service.getSavedConfiguration();
      setConfig(next);
      setStatus(next ? "configured" : "unconfigured");
    } catch (error) {
      setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error");
    }
  }, []);
  const clearDeviceConfiguration = useCallback(async () => {
    setConfig(null);
    setStatus("unconfigured");
    await service.clearConfiguration();
  }, []);
  const configureDevice = useCallback(async (secretKey: string) => {
    setStatus("connecting");
    try {
      const next = await service.configureDevice(secretKey);
      if (!service.isConfigurationValid(next)) throw new DeviceConfigurationError("configuration_error");
      setConfig(next); setStatus("configured"); return true;
    } catch (error) {
      setConfig(null); setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error"); return false;
    }
  }, []);

  useEffect(() => {
    if (status !== "configured") return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const next = await service.getSavedConfiguration();
        if (!active) return;
        if (!next) {
          setConfig(null);
          setStatus("unconfigured");
          return;
        }
        setConfig(current => current?.configVersion === next.configVersion ? current : next);
      } catch (error) {
        if (!active || error instanceof DeviceConfigurationError && error.code === "network_error") return;
        setConfig(null);
        setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error");
      } finally {
        refreshing = false;
      }
    };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(() => void refresh(), CONFIGURATION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [status]);

  const value = useMemo(() => ({ status, config, configureDevice, clearDeviceConfiguration, reloadConfiguration }), [clearDeviceConfiguration, config, configureDevice, reloadConfiguration, status]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error("useDevice must be used within DeviceProvider"); return value; }
