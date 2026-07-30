import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { DeviceBootstrap, DeviceRegistrationResponse } from "../../../shared/deviceBootstrap";
import { DeviceConfigurationError } from "../../types/device";
import {
  DEVICE_ACCESS_TOKEN_STORAGE_KEY,
  DEVICE_CONFIG_STORAGE_KEY,
} from "./DeviceConfigurationService";
import { SupabaseDeviceConfigurationService } from "./SupabaseDeviceConfigurationService";

const VALID_DEVICE_KEY = `mdk_${"a".repeat(24)}_${"B".repeat(43)}`;

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

test("browser-default construction preserves the native fetch global receiver for HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  let receiver: unknown;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: function receiverSensitiveFetch(this: unknown) {
      receiver = this;
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(jsonResponse({
        code: "invalid_setup_request",
        message: "A valid device secret key is required.",
      }, 400));
    } as typeof fetch,
  });

  try {
    const service = new SupabaseDeviceConfigurationService();
    await assert.rejects(
      service.configureDevice(VALID_DEVICE_KEY),
      (error: unknown) => error instanceof DeviceConfigurationError && error.code === "invalid_request",
    );
    assert.equal(receiver, globalThis);
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  }
});

test("browser-default construction completes a valid registration response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: function receiverSensitiveFetch(this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      calls += 1;
      return Promise.resolve(jsonResponse({
        accessToken: "signed-access-token",
        tokenType: "Bearer",
        expiresAt: "2026-07-30T12:15:00.000Z",
        bootstrap: bootstrap(),
      }, 201));
    } as typeof fetch,
  });

  try {
    const service = new SupabaseDeviceConfigurationService();
    const config = await service.configureDevice(VALID_DEVICE_KEY);
    assert.equal(config.deviceId, "device-1");
    assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), "signed-access-token");
    assert.equal(calls, 1);
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  }
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

  const config = await service.configureDevice(VALID_DEVICE_KEY);

  assert.equal(config.restaurantName, "MORROW");
  assert.equal(config.branchName, "Istanbul Branch");
  assert.equal(config.configVersion, 7);
  assert.equal(config.settings.defaultLanguage, "en");
  assert.deepEqual(config.settings.allowedOrderTypes, ["dine_in", "take_away"]);
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), "signed-access-token");
  const publicCache = localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY) ?? "";
  assert.doesNotMatch(publicCache, new RegExp(`${VALID_DEVICE_KEY}|signed-access-token`));
  assert.equal(calls[0].url, "/api/v1/devices/register");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { secretKey: VALID_DEVICE_KEY });
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
  assert.equal(calls[0].init.credentials, "include");
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

test("no stored session performs one refresh attempt and returns setup required", async () => {
  localStorage.setItem(DEVICE_CONFIG_STORAGE_KEY, JSON.stringify({ stale: true }));
  const { fetcher, calls } = queuedFetch(
    jsonResponse({ code: "invalid_device_session", message: "missing" }, 401),
  );
  const service = new SupabaseDeviceConfigurationService(fetcher);

  assert.equal(await service.getSavedConfiguration(), null);
  assert.deepEqual(calls.map(call => call.url), ["/api/v1/devices/session/refresh"]);
  assert.equal(localStorage.getItem(DEVICE_CONFIG_STORAGE_KEY), null);
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), null);
});

test("invalid stored session attempts refresh once and never loops bootstrap", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "invalid-token");
  const { fetcher, calls } = queuedFetch(
    jsonResponse({ code: "invalid_device_session", message: "invalid" }, 401),
    jsonResponse({ code: "invalid_device_session", message: "invalid" }, 401),
  );
  const service = new SupabaseDeviceConfigurationService(fetcher);

  assert.equal(await service.getSavedConfiguration(), null);
  assert.deepEqual(calls.map(call => call.url), [
    "/api/v1/device/bootstrap",
    "/api/v1/devices/session/refresh",
  ]);
});

test("bootstrap network failure is explicit and does not attempt refresh", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "stored-token");
  let calls = 0;
  const service = new SupabaseDeviceConfigurationService((async () => {
    calls += 1;
    throw new TypeError("offline");
  }) as typeof fetch);

  await assert.rejects(
    service.getSavedConfiguration(),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "network_error",
  );
  assert.equal(calls, 1);
});

test("a stalled bootstrap aborts at the request timeout", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "stored-token");
  const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const service = new SupabaseDeviceConfigurationService(fetcher, 5);

  await assert.rejects(
    service.getSavedConfiguration(),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "timeout",
  );
});

test("invalid bootstrap payload becomes a recoverable configuration error", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "stored-token");
  const service = new SupabaseDeviceConfigurationService(queuedFetch(jsonResponse({ invalid: true })).fetcher);

  await assert.rejects(
    service.getSavedConfiguration(),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "configuration_error",
  );
});

test("retry after a network failure can complete without a refresh or bootstrap loop", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "stored-token");
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("offline");
    return jsonResponse(bootstrap());
  }) as typeof fetch;
  const service = new SupabaseDeviceConfigurationService(fetcher);

  await assert.rejects(service.getSavedConfiguration(), DeviceConfigurationError);
  assert.equal((await service.getSavedConfiguration())?.deviceId, "device-1");
  assert.equal(calls, 2);
});

test("registration surfaces safe device setup states", async () => {
  const cases = [
    [jsonResponse({ code: "invalid_device_key", message: "invalid" }, 401), "invalid_key"],
    [jsonResponse({ code: "invalid_setup_request", message: "invalid request" }, 400), "invalid_request"],
    [jsonResponse({ code: "credential_expired", message: "expired" }, 403), "expired"],
    [jsonResponse({ code: "device_disabled", message: "disabled" }, 403), "disabled"],
    [jsonResponse({ code: "device_session_conflict", message: "conflict" }, 409), "conflict"],
    [jsonResponse({ code: "configuration_error", message: "incomplete" }, 503), "configuration_error"],
    [jsonResponse({ code: "device_service_unavailable", message: "unavailable" }, 503), "server_error"],
  ] as const;
  for (const [response, code] of cases) {
    const service = new SupabaseDeviceConfigurationService(queuedFetch(response).fetcher);
    await assert.rejects(
      service.configureDevice(VALID_DEVICE_KEY),
      (error: unknown) => error instanceof DeviceConfigurationError && error.code === code,
    );
  }
  const service = new SupabaseDeviceConfigurationService((async () => {
    throw new TypeError("offline");
  }) as typeof fetch);
  await assert.rejects(
    service.configureDevice(VALID_DEVICE_KEY),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "network_error",
  );
});

test("registration rejects a non-JSON success as a protocol error", async () => {
  const response = new Response("<html>proxy error</html>", {
    status: 201,
    headers: { "content-type": "text/html" },
  });
  const service = new SupabaseDeviceConfigurationService(queuedFetch(response).fetcher);
  await assert.rejects(
    service.configureDevice(VALID_DEVICE_KEY),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "protocol_error",
  );
});

test("registration can be retried after a transport failure", async () => {
  let calls = 0;
  const service = new SupabaseDeviceConfigurationService((async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("offline");
    return jsonResponse({
      accessToken: "signed-access-token",
      tokenType: "Bearer",
      expiresAt: "2026-07-30T12:15:00.000Z",
      bootstrap: bootstrap(),
    }, 201);
  }) as typeof fetch);

  await assert.rejects(service.configureDevice(VALID_DEVICE_KEY), DeviceConfigurationError);
  assert.equal((await service.configureDevice(VALID_DEVICE_KEY)).deviceId, "device-1");
  assert.equal(calls, 2);
});

test("a stalled registration reports timeout and releases the request", async () => {
  const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const service = new SupabaseDeviceConfigurationService(fetcher, 5);

  await assert.rejects(
    service.configureDevice(VALID_DEVICE_KEY),
    (error: unknown) => error instanceof DeviceConfigurationError && error.code === "timeout",
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
    restaurant: { id: "restaurant-1", name: "MORROW", slug: "morrow", logoUrl: null, brandColors: { primary: "#D7FB69" } },
    branch: {
      id: "branch-1",
      name: "Istanbul Branch",
      code: "IST",
      address: null,
      phone: null,
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
      lastSeenAt: null, mode: "kiosk", defaultLanguage: "en",
      featureFlags: { aiAssistant: true, voiceAssistant: true }, printerConfiguration: {},
    },
    configuration: { configVersion: 7, lastUpdated: "2026-07-30T12:00:00.000Z", checksum: "test-checksum" },
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
