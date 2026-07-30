import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SupabaseDeviceConfigurationService } from "../services/device/SupabaseDeviceConfigurationService";
import {
  DeviceConfigurationError,
  type DeviceErrorStatus,
  type DeviceInitializationStatus,
  type DeviceStatus,
  type KioskDeviceConfig,
} from "../types/device";

interface DeviceContextValue {
  status: DeviceStatus;
  initializationStatus: DeviceInitializationStatus;
  initializationError: DeviceErrorStatus | null;
  config: KioskDeviceConfig | null;
  configureDevice(secretKey: string): Promise<boolean>;
  clearDeviceConfiguration(): Promise<void>;
  reloadConfiguration(): Promise<void>;
  retryInitialization(): void;
}

const CONFIGURATION_POLL_INTERVAL_MS = 60_000;
const service = new SupabaseDeviceConfigurationService();
const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KioskDeviceConfig | null>(null);
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const [initializationStatus, setInitializationStatus] = useState<DeviceInitializationStatus>("initializing");
  const [initializationError, setInitializationError] = useState<DeviceErrorStatus | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const initializationSequenceRef = useRef(0);

  useEffect(() => {
    const sequence = ++initializationSequenceRef.current;
    const controller = new AbortController();
    setInitializationStatus("initializing");
    setInitializationError(null);
    setStatus("checking");
    diagnostic("initialization_started", { attempt: initializationAttempt + 1 });
    void (async () => {
      try {
        const saved = await service.getSavedConfiguration({ signal: controller.signal });
        if (controller.signal.aborted || sequence !== initializationSequenceRef.current) return;
        setConfig(saved);
        setStatus(saved ? "configured" : "unconfigured");
        setInitializationStatus(saved ? "authenticated" : "setup_required");
        diagnostic(saved ? "initialization_completed" : "setup_required");
      } catch (error) {
        if (controller.signal.aborted || sequence !== initializationSequenceRef.current) return;
        const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
        setConfig(null);
        setStatus(code);
        setInitializationError(code);
        setInitializationStatus("error");
        diagnostic("initialization_failed", { code });
      }
    })();
    return () => controller.abort();
  }, [initializationAttempt]);

  const retryInitialization = useCallback(() => {
    setInitializationAttempt(value => value + 1);
  }, []);

  const reloadConfiguration = useCallback(async () => {
    try {
      const next = await service.getSavedConfiguration();
      setConfig(next);
      setStatus(next ? "configured" : "unconfigured");
      setInitializationError(null);
      setInitializationStatus(next ? "authenticated" : "setup_required");
    } catch (error) {
      const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
      setStatus(code);
      setInitializationError(code);
      setInitializationStatus("error");
    }
  }, []);
  const clearDeviceConfiguration = useCallback(async () => {
    initializationSequenceRef.current += 1;
    setConfig(null);
    setStatus("unconfigured");
    setInitializationError(null);
    setInitializationStatus("setup_required");
    await service.clearConfiguration();
  }, []);
  const configureDevice = useCallback(async (secretKey: string) => {
    setStatus("connecting");
    try {
      const next = await service.configureDevice(secretKey);
      if (!service.isConfigurationValid(next)) throw new DeviceConfigurationError("configuration_error");
      setConfig(next); setStatus("configured"); setInitializationError(null); setInitializationStatus("authenticated"); return true;
    } catch (error) {
      setConfig(null);
      setStatus(error instanceof DeviceConfigurationError ? error.code : "configuration_error");
      setInitializationStatus("setup_required");
      return false;
    }
  }, []);

  useEffect(() => {
    if (initializationStatus !== "authenticated" || !config) return;
    let active = true;
    let refreshing = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const next = await service.getSavedConfiguration({ signal: controller.signal });
        if (!active) return;
        if (!next) {
          setConfig(null);
          setStatus("unconfigured");
          setInitializationStatus("setup_required");
          return;
        }
        setConfig(current => current?.configVersion === next.configVersion ? current : next);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof DeviceConfigurationError && error.code === "disabled") {
          setConfig(null);
          setStatus("disabled");
          setInitializationError("disabled");
          setInitializationStatus("error");
          return;
        }
        diagnostic("configuration_poll_failed", {
          code: error instanceof DeviceConfigurationError ? error.code : "configuration_error",
        });
      } finally {
        refreshing = false;
      }
    };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(() => void refresh(), CONFIGURATION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [config, initializationStatus]);

  const value = useMemo(() => ({
    status,
    initializationStatus,
    initializationError,
    config,
    configureDevice,
    clearDeviceConfiguration,
    reloadConfiguration,
    retryInitialization,
  }), [
    clearDeviceConfiguration,
    config,
    configureDevice,
    initializationError,
    initializationStatus,
    reloadConfiguration,
    retryInitialization,
    status,
  ]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error("useDevice must be used within DeviceProvider"); return value; }

function diagnostic(event: string, details: Record<string, unknown> = {}) {
  if (import.meta.env?.DEV) console.info("[MORROW device]", { event, ...details });
}
