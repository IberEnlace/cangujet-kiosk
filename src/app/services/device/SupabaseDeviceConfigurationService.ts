import { isSupportedLanguage, type SupportedLanguage } from "../../config/languages";
import { isOrderType } from "../../config/serviceOptions";
import type {
  DeviceAccessTokenResponse,
  DeviceApiError,
  DeviceBootstrap,
  DeviceRegistrationResponse,
} from "../../../shared/deviceBootstrap";
import {
  DeviceConfigurationError,
  type DevicePaymentMethod,
  type KioskDeviceConfig,
} from "../../types/device";
import {
  DEVICE_ACCESS_TOKEN_STORAGE_KEY,
  DEVICE_CONFIG_STORAGE_KEY,
  type DeviceRequestOptions,
  type DeviceConfigurationService,
} from "./DeviceConfigurationService";

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
  }
}

export class SupabaseDeviceConfigurationService implements DeviceConfigurationService {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  async configureDevice(secretKey: string, options: DeviceRequestOptions = {}): Promise<KioskDeviceConfig> {
    try {
      const result = await this.request<DeviceRegistrationResponse>("/api/v1/devices/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secretKey }),
        signal: options.signal,
      }, true);
      this.saveAccessToken(result.accessToken);
      const config = this.mapBootstrap(result.bootstrap, new Date().toISOString());
      this.savePublicConfiguration(config);
      return config;
    } catch (error) {
      throw this.toConfigurationError(error);
    }
  }

  async getSavedConfiguration(options: DeviceRequestOptions = {}): Promise<KioskDeviceConfig | null> {
    const cached = this.readPublicConfiguration();
    diagnostic("restored_session", {
      accessTokenFound: Boolean(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY)),
      publicCacheFound: Boolean(cached),
    });
    try {
      let accessToken = sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
      if (!accessToken) accessToken = await this.refreshAccessToken(options.signal);
      if (!accessToken) {
        this.clearLocalConfiguration();
        return null;
      }
      let bootstrap: DeviceBootstrap;
      try {
        bootstrap = await this.loadBootstrap(accessToken, options.signal);
      } catch (error) {
        if (!(error instanceof DeviceHttpError) || error.status !== 401) throw error;
        accessToken = await this.refreshAccessToken(options.signal);
        if (!accessToken) {
          this.clearLocalConfiguration();
          return null;
        }
        bootstrap = await this.loadBootstrap(accessToken, options.signal);
      }
      const config = this.mapBootstrap(bootstrap, cached?.configuredAt ?? new Date().toISOString());
      this.savePublicConfiguration(config);
      return config;
    } catch (error) {
      throw this.toConfigurationError(error);
    }
  }

  async clearConfiguration(options: DeviceRequestOptions = {}) {
    const accessToken = sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
    try {
      if (accessToken) {
        await this.request<void>("/api/v1/devices/session", {
          method: "DELETE",
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

  isConfigurationValid(value: unknown): value is KioskDeviceConfig {
    if (!isRecord(value) || !hasStrings(value, [
      "deviceId", "kioskId", "kioskName", "branchId", "branchName", "restaurantId",
      "restaurantName", "currency", "locale", "timezone", "configuredAt", "publishedMenuId",
    ])) return false;
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
      && isRecord(value.theme)
      && isRecord(value.paymentConfiguration)
      && isRecord(value.noriConfiguration)
      && isRecord(value.idleScreenConfiguration)
      && isRecord(value.realtimeConfiguration);
  }

  private async loadBootstrap(accessToken: string, signal?: AbortSignal) {
    diagnostic("bootstrap_request_started");
    return this.request<DeviceBootstrap>("/api/v1/device/bootstrap", {
      headers: { authorization: `Bearer ${accessToken}` },
      credentials: "include",
      signal,
    }, true);
  }

  private async refreshAccessToken(signal?: AbortSignal) {
    diagnostic("refresh_attempted");
    try {
      const result = await this.request<DeviceAccessTokenResponse>("/api/v1/devices/session/refresh", {
        method: "POST",
        credentials: "include",
        signal,
      }, true);
      this.saveAccessToken(result.accessToken);
      return result.accessToken;
    } catch (error) {
      if (error instanceof DeviceHttpError && error.status === 401) return null;
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
    };
    if (!this.isConfigurationValid(config)) throw new DeviceConfigurationError("configuration_error");
    return config;
  }

  private readPublicConfiguration() {
    try {
      const raw = localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (this.isConfigurationValid(parsed)) return parsed;
      localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
      return null;
    } catch {
      localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
      return null;
    }
  }

  private savePublicConfiguration(config: KioskDeviceConfig) {
    localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  private saveAccessToken(accessToken: string) {
    sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, accessToken);
  }

  private clearLocalConfiguration() {
    sessionStorage.removeItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(DEVICE_CONFIG_STORAGE_KEY);
  }

  private async request<T>(url: string, init: RequestInit, expectsJson: boolean): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal });
      diagnostic("api_response", { path: url, status: response.status });
      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new DeviceHttpError(response.status, body?.code ?? "device_service_unavailable");
      }
      if (!expectsJson) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof DeviceHttpError || error instanceof DeviceConfigurationError) throw error;
      if (timedOut) throw new DeviceConfigurationError("timeout");
      if (init.signal?.aborted) throw error;
      throw new DeviceConfigurationError("network_error");
    } finally {
      globalThis.clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private toConfigurationError(error: unknown) {
    if (error instanceof DeviceConfigurationError) return error;
    if (!(error instanceof DeviceHttpError)) return new DeviceConfigurationError("configuration_error");
    if (error.code === "device_disabled") return new DeviceConfigurationError("disabled");
    if (error.code === "invalid_device_key" || error.code === "credential_expired") {
      return new DeviceConfigurationError("invalid_key");
    }
    if (error.code === "configuration_error") return new DeviceConfigurationError("configuration_error");
    return error.status >= 500
      ? new DeviceConfigurationError("network_error")
      : new DeviceConfigurationError("configuration_error");
  }
}

function diagnostic(event: string, details: Record<string, unknown> = {}) {
  if (import.meta.env?.DEV) console.info("[MORROW device]", { event, ...details });
}

async function readErrorBody(response: Response): Promise<DeviceApiError | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) && typeof value.code === "string" && typeof value.message === "string"
      ? { code: value.code, message: value.message }
      : null;
  } catch {
    return null;
  }
}
