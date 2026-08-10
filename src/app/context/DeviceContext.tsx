import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SupabaseDeviceConfigurationService } from "../services/device/SupabaseDeviceConfigurationService";
import type { BootstrapDeviceType, DeviceActivationKeyVerificationResponse } from "../../shared/deviceBootstrap";
import { onDeviceSessionInvalidated } from "../services/device/deviceTokenManager";
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
  verifyActivationKey(secretKey: string): Promise<DeviceActivationKeyVerificationResponse | null>;
  configureDevice(secretKey: string, deviceType: BootstrapDeviceType): Promise<boolean>;
  clearDeviceConfiguration(): Promise<void>;
  reloadConfiguration(): Promise<void>;
  retryInitialization(): void;
}

const CONFIGURATION_POLL_INTERVAL_MS = 60_000;
const service = new SupabaseDeviceConfigurationService();
const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [config, setConfig] = useState<KioskDeviceConfig | null>(null);
  const [status, setStatus] = useState<DeviceStatus>("checking");
  const [lifecycleState, setLifecycleState] = useState<DeviceLifecycleState>("initializing");
  const [initializationStatus, setInitializationStatus] = useState<DeviceInitializationStatus>("initializing");
  const [initializationError, setInitializationError] = useState<DeviceErrorStatus | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const initializationSequenceRef = useRef(0);
  const initializationAbortRef = useRef<AbortController | null>(null);
  const configRef = useRef<KioskDeviceConfig | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => onDeviceSessionInvalidated(() => {
    initializationAbortRef.current?.abort();
    initializationSequenceRef.current += 1;
    setConfig(null);
    setStatus("session_expired");
    setInitializationError("session_expired");
    setInitializationStatus("setup_required");
    setLifecycleState("token_expired");
  }), []);

  useEffect(() => {
    const sequence = ++initializationSequenceRef.current;
    if (!enabled) {
      initializationAbortRef.current?.abort();
      initializationAbortRef.current = null;
      setConfig(null);
      setStatus("unconfigured");
      setInitializationError(null);
      setInitializationStatus("not_required");
      setLifecycleState("unconfigured");
      diagnostic("initialization_skipped", { reason: "workspace_does_not_require_device" });
      return;
    }
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
        setInitializationStatus(code === "session_expired" ? "setup_required" : "error");
        setLifecycleState(code === "session_expired" ? "token_expired" : code === "revoked" ? "revoked" : ["network_error", "timeout"].includes(code) ? "offline" : "failed");
        diagnostic("initialization_failed", { code });
      }
    })();
    return () => {
      controller.abort();
      if (initializationAbortRef.current === controller) initializationAbortRef.current = null;
    };
  }, [enabled, initializationAttempt]);

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
      if (code === "session_expired") setConfig(null);
      setStatus(code);
      setInitializationError(code);
      setInitializationStatus(code === "session_expired" ? "setup_required" : "error");
      setLifecycleState(code === "session_expired" ? "token_expired" : code === "revoked" ? "revoked" : ["network_error", "timeout"].includes(code) ? "offline" : "failed");
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
  const verifyActivationKey = useCallback(async (secretKey: string) => {
    setStatus("connecting");
    setInitializationError(null);
    try {
      const result = await service.verifyActivationKey(secretKey);
      setStatus("unconfigured");
      return result;
    } catch (error) {
      const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
      setStatus(code);
      setInitializationError(code);
      return null;
    }
  }, []);
  const configureDevice = useCallback(async (secretKey: string, deviceType: BootstrapDeviceType) => {
    initializationAbortRef.current?.abort();
    initializationSequenceRef.current += 1;
    setStatus("connecting");
    setInitializationError(null);
    setInitializationStatus("registering");
    setLifecycleState("activating");
    try {
      const next = await service.configureDevice(secretKey, deviceType);
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
    if (!enabled || initializationStatus !== "authenticated" || !configRef.current) return;
    let active = true;
    let refreshing = false;
    let consecutiveFailures = 0;
    let pollTimer = 0;
    const controller = new AbortController();
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return true;
      refreshing = true;
      try {
        const currentConfig = configRef.current;
        if (!currentConfig) return true;
        const changed = await service.heartbeat(currentConfig.configVersion, { signal: controller.signal });
        if (!changed && !currentConfig.offline) {
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
        const code = error instanceof DeviceConfigurationError ? error.code : "configuration_error";
        if (code === "session_expired") {
          setConfig(null);
          setStatus(code);
          setInitializationError(code);
          setInitializationStatus("setup_required");
          setLifecycleState("token_expired");
          return true;
        }
        if (["network_error", "timeout"].includes(code)) {
          setConfig(current => current ? { ...current, offline: true } : current);
          setLifecycleState("offline");
        } else {
          setStatus(code);
          setInitializationError(code);
          setInitializationStatus("error");
          setLifecycleState("failed");
        }
        diagnostic("configuration_poll_failed", {
          code,
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
  }, [enabled, initializationStatus]);

  const value = useMemo(() => ({
    status,
    lifecycleState,
    initializationStatus,
    initializationError,
    config,
    verifyActivationKey,
    configureDevice,
    clearDeviceConfiguration,
    reloadConfiguration,
    retryInitialization,
  }), [
    clearDeviceConfiguration,
    config,
    verifyActivationKey,
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
  if (import.meta.env?.DEV) console.info("[cangujet device]", { event, ...details });
}
