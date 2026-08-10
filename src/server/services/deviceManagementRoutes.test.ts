import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { DeviceApiFailure } from "./deviceIdentityService";
import {
  DeviceManagementDependencyFailure,
  type DeviceManagementService,
} from "./deviceManagementService";
import { createDeviceManagementRouter } from "../routes/deviceManagementRoutes";

test("Admin Devices route remains staff-only and returns a snapshot without a device credential", async () => {
  let receivedToken = "";
  const service = {
    snapshot: async (token: string) => {
      receivedToken = token;
      return { branches: [], keys: [], devices: [] };
    },
  } as unknown as DeviceManagementService;
  await withServer(service, async baseUrl => {
    const missing = await fetch(`${baseUrl}/api/v1/admin/devices`);
    assert.equal(missing.status, 401);

    const response = await fetch(`${baseUrl}/api/v1/admin/devices`, {
      headers: { authorization: "Bearer staff.access.token" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { branches: [], keys: [], devices: [] });
    assert.equal(receivedToken, "staff.access.token");
  });
});

test("Admin Devices preserves 403 and classified dependency 503 responses", async () => {
  const forbidden = { snapshot: async () => { throw new DeviceApiFailure("admin_forbidden", 403, "Administrator access is required."); } } as unknown as DeviceManagementService;
  await withServer(forbidden, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/v1/admin/devices`, { headers: { authorization: "Bearer valid.staff.token" } });
    assert.equal(response.status, 403);
  });

  const unavailable = { snapshot: async () => { throw new DeviceManagementDependencyFailure(
    "supabase_rest", "admin_membership_lookup", "device_management_repository_unavailable",
    "Administrator membership could not be verified.", { name: "PostgrestError", code: "PGRST000", causeCode: "EACCES" },
  ); } } as unknown as DeviceManagementService;
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    await withServer(unavailable, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/v1/admin/devices`, { headers: { authorization: "Bearer valid.staff.token" } });
      assert.equal(response.status, 503);
      assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
    });
  } finally {
    console.error = original;
  }
  const diagnostic = entries[0]?.[1] as Record<string, unknown>;
  assert.equal(diagnostic.dependency, "supabase_rest");
  assert.equal(diagnostic.operation, "admin_membership_lookup");
  assert.equal(diagnostic.errorCode, "PGRST000");
  assert.equal(diagnostic.causeCode, "EACCES");
  assert.doesNotMatch(JSON.stringify(entries), /valid\.staff\.token/);
});

async function withServer(service: DeviceManagementService, action: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createDeviceManagementRouter(() => service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await action(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
