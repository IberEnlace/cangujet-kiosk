import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach } from "node:test";
import {
  cashierQueriesMayRun,
  resolveCashierAuthentication,
  type CashierAuthenticationInput,
} from "../auth/cashierAuthentication";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "./device/DeviceConfigurationService";
import { DeviceTokenRefreshError, refreshDeviceAccessToken } from "./device/deviceTokenManager";
import { OrderClientError, OrderService, type OrderCredentialProvider } from "./orders/OrderService";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const originalNavigator = globalThis.navigator;
const originalSessionStorage = globalThis.sessionStorage;

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: new MemoryStorage() });
});

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalSessionStorage });
});

test("cashier-terminal device takes precedence over a loaded cashier profile", () => {
  const result = resolveCashierAuthentication(input({
    deviceInitializationStatus: "authenticated",
    deviceType: "cashier_terminal",
    deviceAccessTokenAvailable: true,
    staffAuthenticated: true,
    staffRole: "cashier",
  }));
  assert.equal(result.mode, "device");
  assert.equal(result.ready, true);
  assert.equal(result.branchId, "device-branch");
});

test("cashier staff is selected only after device restoration resolves without a cashier terminal", () => {
  const result = resolveCashierAuthentication(input({
    deviceInitializationStatus: "setup_required",
    deviceType: null,
    deviceAccessTokenAvailable: false,
    staffAuthenticated: true,
    staffRole: "cashier",
  }));
  assert.equal(result.mode, "staff");
  assert.equal(result.ready, true);
  assert.equal(result.branchId, "staff-branch");
});

test("cashier-terminal without a staff profile uses device authentication", () => {
  const result = resolveCashierAuthentication(input({
    deviceInitializationStatus: "authenticated",
    deviceType: "cashier_terminal",
    deviceAccessTokenAvailable: true,
  }));
  assert.equal(result.mode, "device");
  assert.equal(result.ready, true);
});

test("cashier queries wait during restoration and become eligible after authentication", () => {
  const restoring = resolveCashierAuthentication(input({
    deviceInitializationStatus: "initializing",
    deviceType: null,
    deviceAccessTokenAvailable: false,
    staffAuthenticated: true,
    staffRole: "cashier",
  }));
  assert.equal(cashierQueriesMayRun(restoring, null), false);

  const restored = resolveCashierAuthentication(input({
    deviceInitializationStatus: "authenticated",
    deviceType: "cashier_terminal",
    deviceAccessTokenAvailable: true,
    staffAuthenticated: true,
    staffRole: "cashier",
  }));
  assert.equal(cashierQueriesMayRun(restored, null), true);
  assert.equal(cashierQueriesMayRun(restored, restored.identityKey), false);
});

test("a genuine order 401 performs one mode-specific refresh and retries once", async () => {
  let fetches = 0;
  let refreshes = 0;
  const seenTokens: string[] = [];
  const credentialProvider: OrderCredentialProvider = async (mode, refresh) => {
    assert.equal(mode, "device");
    if (refresh) refreshes += 1;
    return { token: refresh ? "fresh-device-token" : "expired-device-token", failure: null };
  };
  const service = new OrderService({
    credentialProvider,
    fetchImpl: async (_input, init) => {
      fetches += 1;
      seenTokens.push(new Headers(init?.headers).get("authorization") ?? "");
      return fetches === 1
        ? apiResponse(401, "unauthorized")
        : new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.deepEqual(await service.listActive("device"), []);
  assert.equal(refreshes, 1);
  assert.equal(fetches, 2);
  assert.deepEqual(seenTokens, ["Bearer expired-device-token", "Bearer fresh-device-token"]);
});

test("503 preserves the session and does not trigger an authentication refresh", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "still-valid");
  let refreshes = 0;
  const service = new OrderService({
    credentialProvider: async (_mode, refresh) => {
      if (refresh) refreshes += 1;
      return { token: "still-valid", failure: null };
    },
    fetchImpl: async () => apiResponse(503, "server_error"),
  });
  await assert.rejects(service.listActive("device"), (error: unknown) =>
    error instanceof OrderClientError && error.status === 503);
  assert.equal(refreshes, 0);
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), "still-valid");
});

test("device refresh distinguishes unavailable, invalid, and revoked sessions without looping", async () => {
  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "existing-token");
  let requests = 0;
  await assert.rejects(
    refreshDeviceAccessToken(async () => {
      requests += 1;
      return apiResponse(503, "server_error");
    }),
    (error: unknown) => error instanceof DeviceTokenRefreshError && error.status === 503,
  );
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), "existing-token");

  assert.equal(await refreshDeviceAccessToken(async () => {
    requests += 1;
    return apiResponse(401, "unauthorized");
  }), null);
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), null);

  sessionStorage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "revoked-token");
  await assert.rejects(
    refreshDeviceAccessToken(async () => {
      requests += 1;
      return apiResponse(403, "unauthorized");
    }),
    (error: unknown) => error instanceof DeviceTokenRefreshError && error.kind === "forbidden" && error.status === 403,
  );
  assert.equal(sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY), null);
  assert.equal(requests, 3);
});

test("active and pending Cashier endpoints receive the same selected mode", async () => {
  const modes: string[] = [];
  const paths: string[] = [];
  const service = new OrderService({
    credentialProvider: async mode => {
      modes.push(mode);
      return { token: "device-token", failure: null };
    },
    fetchImpl: async input => {
      paths.push(String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await Promise.all([service.listActive("device"), service.listPendingCashierOrders("device")]);
  assert.deepEqual(modes, ["device", "device"]);
  assert.deepEqual(paths.sort(), ["/api/v1/cashier/pending-orders", "/api/v1/orders/active"]);
});

test("change-mode and browser restoration paths preserve the existing device session", () => {
  const app = readFileSync("src/app/App.tsx", "utf8");
  const context = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
  const service = readFileSync("src/app/services/device/SupabaseDeviceConfigurationService.ts", "utf8");
  assert.match(app, /existingDeviceWorkspace[\s\S]*workspaceRouteForDevice\(type\)/);
  assert.doesNotMatch(app, /enterWorkspaceSelection[\s\S]{0,300}clearDeviceConfiguration/);
  assert.match(context, /service\.getSavedConfiguration/);
  assert.match(service, /if \(!accessToken\) accessToken = await this\.refreshAccessToken/);
  assert.match(service, /credentials: "include"/);
  assert.match(service, /this\.saveAccessToken\(result\.accessToken\)/);
});

function input(overrides: Partial<CashierAuthenticationInput>): CashierAuthenticationInput {
  return {
    deviceInitializationStatus: "setup_required",
    deviceId: "device-1",
    deviceType: null,
    deviceBranchId: "device-branch",
    deviceAccessTokenAvailable: false,
    staffLoading: false,
    staffAuthenticated: false,
    staffRole: null,
    staffId: "staff-1",
    staffBranchId: "staff-branch",
    ...overrides,
  };
}

function apiResponse(status: number, code: "unauthorized" | "server_error") {
  return new Response(JSON.stringify({ code, message: code, requestId: "request-1" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
