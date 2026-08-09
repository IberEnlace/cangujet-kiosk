import { isSupportedLanguage, type SupportedLanguage } from "../../config/languages";
import { isOrderType } from "../../config/serviceOptions";
import type {
  DeviceAccessTokenResponse,
  DeviceActivationKeyVerificationResponse,
  BootstrapDeviceType,
  DeviceApiError,
  DeviceBootstrap,
  DeviceRegistrationResponse,
} from "../../../shared/deviceBootstrap";
import { isDeviceActivationKey } from "../../../shared/deviceKey";
import { getDeviceInstallationId } from "./deviceInstallation";
import {
  DeviceConfigurationError,
  type DevicePaymentMethod,
  type KioskDeviceConfig,
} from "../../types/device";
import {
  DEVICE_CONFIG_STORAGE_KEY,
  LEGACY_DEVICE_CONFIG_STORAGE_KEY,
  type DeviceRequestOptions,
  type DeviceConfigurationService,
} from "./DeviceConfigurationService";
import {
  clearDeviceAccessToken,
  readDeviceAccessToken,
  shareDeviceSessionRefresh,
  storeDeviceAccessToken,
} from "./deviceTokenManager";

type Fetcher = typeof fetch;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const PAYMENT_METHODS: DevicePaymentMethod[] = ["card", "pay_at_cashier", "qr"];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const hasStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every(key => typeof value[key] === "string" && value[key] !== "");

class DeviceHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "DeviceHttpError";
  }
}

export class SupabaseDeviceConfigurationService implements DeviceConfigurationService {
  private readonly fetcher: Fetcher;
  private readonly requestTimeoutMs: number;
  private refreshPromise: Promise<string | null> | null = null;
  private refreshAttempt = 0;

  constructor(
    fetcher?: Fetcher,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async verifyActivationKey(secretKey: string, options: DeviceRequestOptions = {}): Promise<DeviceActivationKeyVerificationResponse> {
    try {
      return await this.request<DeviceActivationKeyVerificationResponse>("/api/v1/device/activation-key/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secretKey }),
        signal: options.signal,
      }, true);
    } catch (error) {
      throw this.toConfigurationError(error);
    }
  }

  async configureDevice(secretKey: string, deviceType?: BootstrapDeviceType, options: DeviceRequestOptions = {}): Promise<KioskDeviceConfig> {
    diagnostic("registration_request_started");
    try {
      const activation = isDeviceActivationKey(secretKey);
      const result = await this.request<DeviceRegistrationResponse>(activation ? "/api/v1/device/activate" : "/api/v1/devices/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(activation ? {
          secretKey,
          deviceFingerprint: getDeviceInstallationId(),
          deviceType,
          appVersion: import.meta.env?.VITE_APP_VERSION ?? "web",
          requestId: crypto.randomUUID(),
        } : { secretKey }),
        signal: options.signal,
      }, true);
      this.saveAccessToken(result.accessToken);
      const config = this.mapBootstrap(result.bootstrap, new Date().toISOString());
      this.savePublicConfiguration(config);
      diagnostic("bootstrap_applied");
      diagnostic("registration_succeeded");
      return config;
    } catch (error) {
      diagnosticError("registration_catch", error);
      const normalized = this.toConfigurationError(error);
      diagnostic("registration_failed", { code: normalized.code });
      throw normalized;
    }
  }

  async getSavedConfiguration(options: DeviceRequestOptions = {}): Promise<KioskDeviceConfig | null> {
    const cached = this.readPublicConfiguration();
    const storedAccessToken = this.readAccessToken();
    const hadDeviceState = Boolean(storedAccessToken || cached);
    diagnostic("restored_session", {
      accessTokenFound: Boolean(storedAccessToken),
      publicCacheFound: Boolean(cached),
    });
    try {
      let accessToken = storedAccessToken;
      if (!accessToken) accessToken = await this.refreshAccessToken(options.signal);
      if (!accessToken) {
        this.clearDeviceAccessToken();
        if (hadDeviceState) throw new DeviceConfigurationError("session_expired");
        return null;
      }
      let bootstrap: DeviceBootstrap;
      try {
        bootstrap = await this.loadBootstrap(accessToken, options.signal);
      } catch (error) {
        if (!(error instanceof DeviceHttpError) || error.status !== 401) throw error;
        accessToken = await this.refreshAccessToken(options.signal);
        if (!accessToken) {
          this.clearDeviceAccessToken();
          throw new DeviceConfigurationError("session_expired");
        }
        bootstrap = await this.loadBootstrap(accessToken, options.signal);
      }
      const config = this.mapBootstrap(bootstrap, new Date().toISOString());
      this.savePublicConfiguration(config);
      diagnostic("bootstrap_applied", { source: "server", configVersion: config.configVersion });
      return config;
    } catch (error) {
      const normalized = this.toConfigurationError(error);
      if (cached && ["network_error", "timeout"].includes(normalized.code)) {
        diagnostic("offline_bootstrap_restored", { code: normalized.code, configVersion: cached.configVersion, source: "cache" });
        return { ...cached, offline: true };
      }
      throw normalized;
    }
  }

  async clearConfiguration(options: DeviceRequestOptions = {}) {
    let accessToken = this.readAccessToken();
    try {
      if (!accessToken) accessToken = await this.refreshAccessToken(options.signal);
      if (accessToken) {
        await this.request<void>("/api/v1/device/logout", {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          credentials: "include",
          signal: options.signal,
        }, false);
      }
    } catch {
      // Local setup must still be cleared when the server is unreachable.
    } finally {
      this.clearLocalConfiguration();
    }
  }

  async heartbeat(configurationVersion: number, options: DeviceRequestOptions = {}) {
    let accessToken = this.readAccessToken();
    if (!accessToken) accessToken = await this.refreshAccessToken(options.signal);
    if (!accessToken) throw new DeviceConfigurationError("session_expired");
    try {
      const result = await this.request<{ configurationChanged: boolean }>("/api/v1/device/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ configurationVersion, appVersion: import.meta.env?.VITE_APP_VERSION ?? "web", connectionHealth: "online" }),
        signal: options.signal,
      }, true);
      return result.configurationChanged;
    } catch (error) {
      if (!(error instanceof DeviceHttpError) || error.status !== 401) throw this.toConfigurationError(error);
      accessToken = await this.refreshAccessToken(options.signal);
      if (!accessToken) throw new DeviceConfigurationError("session_expired");
      const result = await this.request<{ configurationChanged: boolean }>("/api/v1/device/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ configurationVersion, appVersion: import.meta.env?.VITE_APP_VERSION ?? "web", connectionHealth: "online" }),
        signal: options.signal,
      }, true);
      return result.configurationChanged;
    }
  }

  isConfigurationValid(value: unknown): value is KioskDeviceConfig {
    if (!isRecord(value) || !hasStrings(value, [
      "deviceId", "kioskId", "kioskName", "branchId", "branchName", "restaurantId",
      "restaurantName", "currency", "locale", "timezone", "configuredAt", "publishedMenuId",
    ])) return false;
    if (!isRecord(value.bootstrap) || !isRecord(value.bootstrap.restaurant)
      || !isRecord(value.bootstrap.branch) || !isRecord(value.bootstrap.device)
      || !isRecord(value.bootstrap.configuration)) return false;
    if (!Number.isInteger(value.configVersion) || Number(value.configVersion) < 1) return false;
    if (!isRecord(value.settings)) return false;
    const settings = value.settings;
    return Array.isArray(settings.enabledLanguages)
      && settings.enabledLanguages.length > 0
      && settings.enabledLanguages.every(item => typeof item === "string" && isSupportedLanguage(item))
      && typeof settings.defaultLanguage === "string"
      && isSupportedLanguage(settings.defaultLanguage)
      && settings.enabledLanguages.includes(settings.defaultLanguage)
      && Array.isArray(settings.allowedOrderTypes)
      && settings.allowedOrderTypes.length > 0
      && settings.allowedOrderTypes.every(item => typeof item === "string" && isOrderType(item))
      && Array.isArray(settings.allowedPaymentMethods)
      && settings.allowedPaymentMethods.length > 0
      && settings.allowedPaymentMethods.every(item => PAYMENT_METHODS.includes(item as DevicePaymentMethod))
      && typeof settings.receiptPrintingEnabled === "boolean"
      && typeof settings.aiAssistantEnabled === "boolean"
      && typeof settings.voiceAssistantEnabled === "boolean"
      && typeof value.offline === "boolean"
      && isRecord(value.theme)
      && isRecord(value.paymentConfiguration)
      && isRecord(value.noriConfiguration)
      && isRecord(value.idleScreenConfiguration)
      && isRecord(value.realtimeConfiguration);
  }

  private async loadBootstrap(accessToken: string, signal?: AbortSignal) {
    diagnostic("bootstrap_request_started", { path: "/api/v1/device/bootstrap", credentialType: "device+cookie", credentialsAttached: true });
    return this.request<DeviceBootstrap>("/api/v1/device/bootstrap", {
      headers: { authorization: `Bearer ${accessToken}` },
      credentials: "include",
      signal,
    }, true);
  }

  private async refreshAccessToken(signal?: AbortSignal) {
    if (this.refreshPromise) {
      diagnostic("refresh_joined", { path: "/api/v1/devices/session/refresh", attempt: this.refreshAttempt, credentialType: "cookie", credentialsAttached: true });
      return this.refreshPromise;
    }
    const attempt = ++this.refreshAttempt;
    diagnostic("refresh_attempted", { path: "/api/v1/devices/session/refresh", attempt, credentialType: "cookie", credentialsAttached: true });
    const operation = shareDeviceSessionRefresh(() => this.performRefresh(attempt, signal));
    this.refreshPromise = operation;
    try { return await operation; }
    finally { if (this.refreshPromise === operation) this.refreshPromise = null; }
  }

  private async performRefresh(attempt: number, _signal?: AbortSignal) {
    try {
      const result = await this.request<DeviceAccessTokenResponse>("/api/v1/devices/session/refresh", {
        method: "POST",
        credentials: "include",
      }, true);
      this.saveAccessToken(result.accessToken);
      diagnostic("refresh_succeeded", { path: "/api/v1/devices/session/refresh", attempt, credentialType: "cookie", credentialsAttached: true });
      return result.accessToken;
    } catch (error) {
      if (error instanceof DeviceHttpError && error.status === 401) {
        this.clearDeviceAccessToken();
        diagnostic("refresh_rejected", { path: "/api/v1/devices/session/refresh", status: 401, attempt, credentialType: "cookie", credentialsAttached: true });
        return null;
      }
      throw error;
    }
  }

  private mapBootstrap(bootstrap: DeviceBootstrap, configuredAt: string): KioskDeviceConfig {
    const enabledLanguages = bootstrap.languages
      .map(language => language.code)
      .filter((code): code is SupportedLanguage => isSupportedLanguage(code));
    const configuredDefault = bootstrap.languages.find(language => language.default)?.code;
    const defaultLanguage = configuredDefault && isSupportedLanguage(configuredDefault)
      ? configuredDefault
      : enabledLanguages[0];
    const locale = bootstrap.languages.find(language => language.code === defaultLanguage)?.locale;
    const config: KioskDeviceConfig = {
      bootstrap,
      deviceId: bootstrap.device.id,
      kioskId: bootstrap.device.id,
      kioskName: bootstrap.device.name,
      branchId: bootstrap.branch.id,
      branchName: bootstrap.branch.name,
      restaurantId: bootstrap.restaurant.id,
      restaurantName: bootstrap.restaurant.name,
      currency: bootstrap.currency,
      locale: locale ?? "en",
      timezone: bootstrap.branch.timezone,
      menuVersion: String(bootstrap.publishedMenuVersion),
      publishedMenuId: bootstrap.publishedMenuId,
      configVersion: bootstrap.configVersion,
      theme: bootstrap.theme,
      logoUrl: bootstrap.logoUrl,
      taxRate: bootstrap.taxRate,
      openingHours: bootstrap.openingHours,
      paymentConfiguration: bootstrap.paymentConfiguration,
      noriConfiguration: bootstrap.noriConfiguration,
      idleScreenConfiguration: bootstrap.idleScreenConfiguration,
      realtimeConfiguration: bootstrap.realtimeConfiguration,
      settings: {
        enabledLanguages,
        defaultLanguage,
        allowedOrderTypes: bootstrap.serviceModes,
        allowedPaymentMethods: bootstrap.paymentConfiguration.enabledMethods,
        receiptPrintingEnabled: bootstrap.paymentConfiguration.receiptPrintingEnabled,
        aiAssistantEnabled: bootstrap.noriConfiguration.enabled,
        voiceAssistantEnabled: bootstrap.noriConfiguration.voiceEnabled,
      },
      configuredAt,
      offline: false,
    };
    if (!this.isConfigurationValid(config)) throw new DeviceConfigurationError("configuration_error");
    return config;
  }

  private readPublicConfiguration() {
    try {
      const current = localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY);
      const legacy = current ? null : localStorage.getItem(LEGACY_DEVICE_CONFIG_STORAGE_KEY);
      const raw = current ?? legacy;
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (this.isConfigurationValid(parsed)) {
        if (legacy) {
          localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_DEVICE_CONFIG_STORAGE_KEY);
        }
        return parsed;
      }
      localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
      localStorage.removeItem(LEGACY_DEVICE_CONFIG_STORAGE_KEY);
      return null;
    } catch {
      localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
      localStorage.removeItem(LEGACY_DEVICE_CONFIG_STORAGE_KEY);
      return null;
    }
  }

  private savePublicConfiguration(config: KioskDeviceConfig) {
    localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  private saveAccessToken(accessToken: string) {
    storeDeviceAccessToken(accessToken);
  }

  private readAccessToken() {
    return readDeviceAccessToken();
  }

  private clearDeviceAccessToken() {
    clearDeviceAccessToken();
  }

  private clearLocalConfiguration() {
    this.clearDeviceAccessToken();
    localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DEVICE_CONFIG_STORAGE_KEY);
  }

  private async request<T>(url: string, init: RequestInit, expectsJson: boolean): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const isRegistration = url === "/api/v1/devices/register" || url === "/api/v1/device/activate" || url === "/api/v1/device/activation-key/verify";
    const abortFromCaller = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    const credentialType = requestCredentialType(init);
    diagnostic("api_request", {
      path: url,
      credentialType,
      credentialsAttached: credentialType !== "none",
    });

    let response: Response;
    try {
      if (isRegistration) diagnostic("registration_before_fetch");
      response = await this.fetcher(url, { ...init, signal: controller.signal });
      if (isRegistration) diagnostic("registration_after_fetch");
    } catch (error) {
      if (isRegistration) diagnosticError("registration_fetch_catch", error);
      diagnostic("api_response", {
        path: url,
        status: timedOut ? "timeout" : init.signal?.aborted ? "aborted" : "network_error",
        credentialType,
        credentialsAttached: credentialType !== "none",
      });
      if (timedOut) throw new DeviceConfigurationError("timeout");
      if (init.signal?.aborted) throw error;
      if (error instanceof TypeError) throw new DeviceConfigurationError("network_error");
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abortFromCaller);
    }

    diagnostic("api_response", {
      path: url,
      status: response.status,
      credentialType,
      credentialsAttached: credentialType !== "none",
    });
    if (isRegistration) {
      diagnostic("registration_response_received", { status: response.status });
      diagnostic("registration_response_status", { status: response.status });
      diagnostic("registration_response_headers", { headers: safeResponseHeaders(response.headers) });
      diagnostic("registration_before_parsing_body");
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      if (isRegistration) diagnosticError("registration_body_read_catch", error);
      throw new DeviceConfigurationError("protocol_error");
    }

    const body = parseJsonBody(bodyText);
    if (isRegistration) {
      diagnostic("registration_after_parsing_body", {
        empty: bodyText.trim().length === 0,
        validJson: body.valid,
      });
    }

    if (!response.ok) {
      const apiError = body.valid && isDeviceApiError(body.value) ? body.value : null;
      const code = apiError?.code ?? fallbackHttpErrorCode(response.status);
      if (isRegistration) {
        diagnostic("registration_before_application_error", { status: response.status, code });
      }
      throw new DeviceHttpError(response.status, code);
    }

    if (!expectsJson) return undefined as T;
    if (!body.valid || bodyText.trim().length === 0) {
      if (isRegistration) {
        diagnostic("registration_before_application_error", {
          status: response.status,
          code: "protocol_error",
        });
      }
      throw new DeviceConfigurationError("protocol_error");
    }
    return body.value as T;
  }

  private toConfigurationError(error: unknown) {
    if (error instanceof DeviceConfigurationError) return error;
    if (!(error instanceof DeviceHttpError)) return new DeviceConfigurationError("configuration_error");
    if (error.code === "device_disabled") return new DeviceConfigurationError("disabled");
    if (error.code === "device_revoked") return new DeviceConfigurationError("revoked");
    if (error.code === "credential_expired") return new DeviceConfigurationError("expired");
    if (error.code === "device_key_expired") return new DeviceConfigurationError("expired");
    if (error.code === "device_key_revoked") return new DeviceConfigurationError("revoked");
    if (error.code === "device_key_used") return new DeviceConfigurationError("already_used");
    if (error.code === "invalid_device_key") return new DeviceConfigurationError("invalid_key");
    if (error.code === "invalid_setup_request" || error.status === 400) return new DeviceConfigurationError("invalid_request");
    if (error.status === 409) return new DeviceConfigurationError("conflict");
    if (error.code === "configuration_error") return new DeviceConfigurationError("configuration_error");
    if (error.status === 404) return new DeviceConfigurationError("server_error");
    if (error.status >= 500) return new DeviceConfigurationError("server_error");
    return new DeviceConfigurationError("protocol_error");
  }
}

function diagnostic(event: string, details: Record<string, unknown> = {}) {
  if (import.meta.env?.DEV) console.info("[MORROW device]", { event, ...details });
}

function diagnosticError(event: string, error: unknown) {
  if (!import.meta.env?.DEV) return;
  const value = error instanceof Error ? error : null;
  console.error("[MORROW device]", {
    event,
    constructor: value?.constructor?.name ?? typeof error,
    name: value?.name ?? null,
    message: value?.message ?? String(error),
    stack: value?.stack ?? null,
    instanceofDOMException: typeof DOMException !== "undefined" && error instanceof DOMException,
    instanceofTypeError: error instanceof TypeError,
  });
}

function safeResponseHeaders(headers: Headers) {
  return Object.fromEntries([...headers.entries()].map(([name, value]) => [
    name,
    /^(authorization|cookie|set-cookie)$/i.test(name) ? "[redacted]" : value,
  ]));
}

function parseJsonBody(bodyText: string): { valid: true; value: unknown } | { valid: false; value: null } {
  if (bodyText.trim().length === 0) return { valid: false, value: null };
  try {
    return { valid: true, value: JSON.parse(bodyText) as unknown };
  } catch {
    return { valid: false, value: null };
  }
}

function isDeviceApiError(value: unknown): value is DeviceApiError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function fallbackHttpErrorCode(status: number) {
  if (status === 400) return "invalid_setup_request";
  if (status === 401) return "invalid_device_key";
  if (status === 403) return "device_disabled";
  if (status === 409) return "device_session_conflict";
  return "device_service_unavailable";
}

function requestCredentialType(init: RequestInit) {
  const headers = new Headers(init.headers);
  const hasBearerToken = headers.has("authorization");
  const hasCookieSession = init.credentials === "include";
  if (hasBearerToken && hasCookieSession) return "device+cookie";
  if (hasBearerToken) return "device";
  if (hasCookieSession) return "cookie";
  return "none";
}
