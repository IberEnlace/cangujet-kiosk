import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MockDeviceConfigurationService } from "../services/device/MockDeviceConfigurationService";
import { DeviceConfigurationError, type DeviceStatus, type KioskDeviceConfig } from "../types/device";

interface DeviceContextValue {
  status: DeviceStatus;
  config: KioskDeviceConfig | null;
  configureDevice(secretKey: string): Promise<boolean>;
  clearDeviceConfiguration(): void;
  reloadConfiguration(): void;
}

const service = new MockDeviceConfigurationService();
const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KioskDeviceConfig | null>(null);
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const initializationStartedRef = useRef(false);

  useEffect(() => {
    if (initializationStartedRef.current) return;
    initializationStartedRef.current = true;
    const saved = service.getSavedConfiguration();
    setConfig(saved);
    setStatus(saved ? "configured" : "unconfigured");
  }, []);

  const reloadConfiguration = useCallback(() => { const next = service.getSavedConfiguration(); setConfig(next); setStatus(next ? "configured" : "unconfigured"); }, []);
  const clearDeviceConfiguration = useCallback(() => { service.clearConfiguration(); setConfig(null); setStatus("unconfigured"); }, []);
  const configureDevice = useCallback(async (secretKey: string) => {
    setStatus("connecting");
    try {
      const next = await service.configureDevice(secretKey);
      if (!service.isConfigurationValid(next)) throw new DeviceConfigurationError("configuration_error");
      service.saveConfiguration(next); setConfig(next); setStatus("configured"); return true;
    } catch (error) {
      setConfig(null); setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error"); return false;
    }
  }, []);

  const value = useMemo(() => ({ status, config, configureDevice, clearDeviceConfiguration, reloadConfiguration }), [clearDeviceConfiguration, config, configureDevice, reloadConfiguration, status]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error("useDevice must be used within DeviceProvider"); return value; }
