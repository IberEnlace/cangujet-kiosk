import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SupabaseDeviceConfigurationService } from "../services/device/SupabaseDeviceConfigurationService";
import {
  DeviceConfigurationError,
  type DeviceErrorStatus,
  type DeviceInitializationStatus,
  type DeviceLifecycleState,
  type DeviceStatus,
  type KioskDeviceConfig,
} from "../types/device";

interface DeviceContextValue {
  status: DeviceStatus;
  lifecycleState: DeviceLifecycleState;
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
  const [lifecycleState, setLifecycleState] = useState<DeviceLifecycleState>("initializing");
  const [initializationStatus, setInitializationStatus] = useState<DeviceInitializationStatus>("initializing");
  const [initializationError, setInitializationError] = useState<DeviceErrorStatus | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const initializationSequenceRef = useRef(0);
  const initializationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const sequence = ++initializationSequenceRef.current;
    const controller = new AbortController();
    initializationAbortRef.current = controller;
    setInitializationStatus("initializing");
    setInitializationError(null);
    setStatus("checking");
    setLifecycleState("initializing");
    diagnostic("initialization_started", { attempt: initializationAttempt + 1 });
    void (async () => {
      try {
        const saved = await service.getSavedConfiguration({ signal: controller.signal });
        if (controller.signal.aborted || sequence !== initializationSequenceRef.current) return;
        setConfig(saved);
        setStatus(saved ? "configured" : "unconfigured");
        setInitializationStatus(saved ? "authenticated" : "setup_required");
        setLifecycleState(saved ? (saved.offline ? "offline" : "active") : "unconfigured");
        diagnostic(saved ? "initialization_completed" : "setup_required");
      } catch (error) {
        if (controller.signal.aborted || sequence !== initializationSequenceRef.current) return;
        const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
        setConfig(null);
        setStatus(code);
        setInitializationError(code);
        setInitializationStatus("error");
        setLifecycleState(code === "revoked" ? "revoked" : code === "network_error" ? "offline" : "failed");
        diagnostic("initialization_failed", { code });
      }
    })();
    return () => {
      controller.abort();
      if (initializationAbortRef.current === controller) initializationAbortRef.current = null;
    };
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
      setLifecycleState(next ? (next.offline ? "offline" : "active") : "unconfigured");
    } catch (error) {
      const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
      setStatus(code);
      setInitializationError(code);
      setInitializationStatus("error");
      setLifecycleState(code === "revoked" ? "revoked" : code === "network_error" ? "offline" : "failed");
    }
  }, []);
  const clearDeviceConfiguration = useCallback(async () => {
    initializationAbortRef.current?.abort();
    initializationSequenceRef.current += 1;
    setConfig(null);
    setStatus("unconfigured");
    setInitializationError(null);
    setInitializationStatus("setup_required");
    setLifecycleState("unconfigured");
    await service.clearConfiguration();
  }, []);
  const configureDevice = useCallback(async (secretKey: string) => {
    initializationAbortRef.current?.abort();
    initializationSequenceRef.current += 1;
    setStatus("connecting");
    setInitializationError(null);
    setInitializationStatus("registering");
    setLifecycleState("activating");
    try {
      const next = await service.configureDevice(secretKey);
      if (!service.isConfigurationValid(next)) throw new DeviceConfigurationError("configuration_error");
      setConfig(next);
      setStatus("configured");
      setInitializationError(null);
      setInitializationStatus("authenticated");
      setLifecycleState("active");
      diagnostic("bootstrap_applied");
      return true;
    } catch (error) {
      const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
      setConfig(null);
      setStatus(code);
      setInitializationError(code);
      setInitializationStatus("error");
      setLifecycleState(code === "revoked" ? "revoked" : code === "network_error" ? "offline" : "failed");
      diagnostic("registration_failed", { code });
      return false;
    }
  }, []);

  useEffect(() => {
    if (initializationStatus !== "authenticated" || !config) return;
    let active = true;
    let refreshing = false;
    let consecutiveFailures = 0;
    let pollTimer = 0;
    const controller = new AbortController();
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return true;
      refreshing = true;
      try {
        const changed = await service.heartbeat(config.configVersion, { signal: controller.signal });
        if (!changed && !config.offline) {
          setLifecycleState("active");
          return true;
        }
        const next = await service.getSavedConfiguration({ signal: controller.signal });
        if (!active) return;
        if (!next) {
          setConfig(null);
          setStatus("unconfigured");
          setInitializationStatus("setup_required");
          setLifecycleState("unconfigured");
          return true;
        }
        setConfig(current => current
          && current.configVersion === next.configVersion
          && current.bootstrap.configuration.checksum === next.bootstrap.configuration.checksum
          && current.offline === next.offline
          ? current
          : next);
        setLifecycleState(next.offline ? "offline" : "active");
        return !next.offline;
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof DeviceConfigurationError && ["disabled", "revoked"].includes(error.code)) {
          setConfig(null);
          setStatus(error.code);
          setInitializationError(error.code);
          setInitializationStatus("error");
          setLifecycleState(error.code === "revoked" ? "revoked" : "failed");
          await service.clearConfiguration().catch(() => undefined);
          return true;
        }
        setConfig(current => current ? { ...current, offline: true } : current);
        setLifecycleState("offline");
        diagnostic("configuration_poll_failed", {
          code: error instanceof DeviceConfigurationError ? error.code : "configuration_error",
        });
        return false;
      } finally {
        refreshing = false;
      }
    };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const schedule = (delay: number) => {
      pollTimer = window.setTimeout(() => void refresh().then(success => {
        consecutiveFailures = success ? 0 : consecutiveFailures + 1;
        const nextDelay = success
          ? CONFIGURATION_POLL_INTERVAL_MS
          : Math.min(CONFIGURATION_POLL_INTERVAL_MS, 5_000 * (2 ** Math.min(consecutiveFailures - 1, 4)));
        if (active) schedule(nextDelay);
      }), delay);
    };
    schedule(CONFIGURATION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [config, initializationStatus]);

  const value = useMemo(() => ({
    status,
    lifecycleState,
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
    lifecycleState,
  ]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error("useDevice must be used within DeviceProvider"); return value; }

function diagnostic(event: string, details: Record<string, unknown> = {}) {
  if (import.meta.env?.DEV) console.info("[MORROW device]", { event, ...details });
}
