import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { DeviceBootstrap, DeviceRegistrationResponse } from "../../../shared/deviceBootstrap";
import { DeviceConfigurationError } from "../../types/device";
import {
  DEVICE_ACCESS_TOKEN_STORAGE_KEY,
  DEVICE_CONFIG_STORAGE_KEY,
} from "./DeviceConfigurationService";
import { SupabaseDeviceConfigurationService } from "./SupabaseDeviceConfigurationService";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: new MemoryStorage() });
});

test("device registration maps one bootstrap and never persists the raw key or access token publicly", async () => {
  const registration: DeviceRegistrationResponse = {
    accessToken: "signed-access-token",
    tokenType: "Bearer",
    expiresAt: "2026-07-30T12:15:00.000Z",
    bootstrap: bootstrap(),
  };
  const { fetcher, calls } = queuedFetch(jsonResponse(registration, 201));
  const service = new SupabaseDeviceConfigurationService(fetcher);

  const config = await service.configureDevice("mdk_public_secret");

  assert.equal(config.restaurantName, "MORROW");
  assert.equal(config.branchName, "Istanbul Branch");
  assert.equal(config.configVersion, 7);
  assert.equal(config.settings.defaultLanguage, "en");
  assert.deepEqual(config.settings.allowedOrderTypes, ["dine_in", "take_away"]);
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), "signed-access-token");
  const publicCache = localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY) ?? "";
  assert.doesNotMatch(publicCache, /mdk_public_secret|signed-access-token/);
  assert.equal(calls[0].url, "/api/v1/devices/register");
  assert.equal(calls[0].init.credentials, "same-origin");
});

test("startup restores a session through the HttpOnly refresh cookie and reloads bootstrap", async () => {
  const { fetcher, calls } = queuedFetch(
    jsonResponse({ accessToken: "refreshed-token", tokenType: "Bearer", expiresAt: "2026-07-30T12:15:00.000Z" }),
    jsonResponse(bootstrap()),
  );
  const service = new SupabaseDeviceConfigurationService(fetcher);

  const config = await service.getSavedConfiguration();

  assert.equal(config?.deviceId, "device-1");
  assert.deepEqual(calls.map(call => call.url), [
    "/api/v1/devices/session/refresh",
    "/api/v1/device/bootstrap",
  ]);
  assert.equal(calls[1].init.headers && (calls[1].init.headers as Record<string, string>).authorization, "Bearer refreshed-token");
});

test("an expired access token refreshes once before retrying bootstrap", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "expired-token");
  const { fetcher, calls } = queuedFetch(
    jsonResponse({ code: "invalid_device_session", message: "expired" }, 401),
    jsonResponse({ accessToken: "fresh-token", tokenType: "Bearer", expiresAt: "2026-07-30T12:15:00.000Z" }),
    jsonResponse(bootstrap()),
  );
  const service = new SupabaseDeviceConfigurationService(fetcher);

  const config = await service.getSavedConfiguration();

  assert.equal(config?.configVersion, 7);
  assert.deepEqual(calls.map(call => call.url), [
    "/api/v1/device/bootstrap",
    "/api/v1/devices/session/refresh",
    "/api/v1/device/bootstrap",
  ]);
});

test("registration surfaces safe device setup states", async () => {
  const cases = [
    [jsonResponse({ code: "invalid_device_key", message: "invalid" }, 401), "invalid_key"],
    [jsonResponse({ code: "credential_expired", message: "expired" }, 401), "invalid_key"],
    [jsonResponse({ code: "device_disabled", message: "disabled" }, 403), "disabled"],
    [jsonResponse({ code: "configuration_error", message: "incomplete" }, 503), "configuration_error"],
  ] as const;
  for (const [response, code] of cases) {
    const service = new SupabaseDeviceConfigurationService(queuedFetch(response).fetcher);
    await assert.rejects(
      service.configureDevice("secret"),
      (error: unknown) => error instanceof DeviceConfigurationError && error.code === code,
    );
  }
  const service = new SupabaseDeviceConfigurationService((async () => {
    throw new TypeError("offline");
  }) as typeof fetch);
  await assert.rejects(
    service.configureDevice("secret"),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "network_error",
  );
});

test("clearing setup requests session revocation and removes both storage classes", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "access-token");
  localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, "{}");
  const { fetcher, calls } = queuedFetch(new Response(null, { status: 204 }));
  const service = new SupabaseDeviceConfigurationService(fetcher);

  await service.clearConfiguration();

  assert.equal(calls[0].url, "/api/v1/devices/session");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY), null);
});

function queuedFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch");
    return response;
  }) as typeof fetch;
  return { fetcher, calls };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bootstrap(): DeviceBootstrap {
  return {
    restaurant: { id: "restaurant-1", name: "MORROW", slug: "morrow", logoUrl: null },
    branch: {
      id: "branch-1",
      name: "Istanbul Branch",
      code: "IST",
      currency: "EUR",
      taxRate: 0.2,
      timezone: "Europe/Istanbul",
      serviceModes: ["dine_in", "take_away"],
      openingHours: [{ dayOfWeek: 1, sequence: 0, opensAt: "09:00:00", closesAt: "22:00:00", closed: false }],
    },
    device: {
      id: "device-1",
      type: "kiosk",
      name: "Kiosk 1",
      status: "active",
      configVersion: 7,
      lastSeenAt: null,
    },
    configVersion: 7,
    theme: { id: "theme-1", name: "MORROW Default", tokens: { primary: "#D7FB69" } },
    logoUrl: null,
    languages: [
      { code: "en", name: "English", nativeName: "English", locale: "en-TR", direction: "ltr", default: true },
      { code: "tr", name: "Turkish", nativeName: "Türkçe", locale: "tr-TR", direction: "ltr", default: false },
    ],
    currency: "EUR",
    taxRate: 0.2,
    serviceModes: ["dine_in", "take_away"],
    openingHours: [{ dayOfWeek: 1, sequence: 0, opensAt: "09:00:00", closesAt: "22:00:00", closed: false }],
    paymentConfiguration: {
      enabledMethods: ["card", "pay_at_cashier", "qr"],
      receiptPrintingEnabled: true,
      publicOptions: {},
    },
    noriConfiguration: { enabled: true, voiceEnabled: true, voiceSettings: {}, publicOptions: {} },
    idleScreenConfiguration: {
      timeoutSeconds: 120,
      videoIntervalMs: 9000,
      minimumPlaybackMs: 4000,
      transitionMs: 500,
      title: "MORROW",
      slogan: "Fresh. Fast. Delicious.",
      description: "Start your delicious journey",
      buttonLabel: "START ORDER",
      touchLabel: "Touch anywhere to begin",
      videos: ["/videos/intro-1.mp4"],
    },
    publishedMenuId: "menu-1",
    publishedMenuVersion: 3,
    realtimeConfiguration: {
      enabled: false,
      transport: "private_broadcast",
      branchTopic: "branch:branch-1:configuration",
      deviceTopic: "device:device-1:configuration",
    },
  };
}
