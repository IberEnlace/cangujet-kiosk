import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { DeviceApiFailure } from "./deviceIdentityService";
import { DeviceManagementService } from "./deviceManagementService";

test("device management returns 401 only for an invalid staff credential", async () => {
  const service = serviceWithAuthError({ status: 401, name: "AuthApiError", message: "invalid JWT" });

  await assert.rejects(
    service.snapshot("invalid-staff-token"),
    (error: unknown) => error instanceof DeviceApiFailure
      && error.status === 401
      && error.code === "invalid_staff_session",
  );
});

test("device management preserves a valid frontend session when Supabase auth is unavailable", async () => {
  const service = serviceWithAuthError({ status: 503, name: "AuthRetryableFetchError", message: "fetch failed" });

  await assert.rejects(
    service.snapshot("existing-staff-token"),
    (error: unknown) => error instanceof DeviceApiFailure
      && error.status === 503
      && error.code === "staff_authentication_unavailable",
  );
});

function serviceWithAuthError(error: { status: number; name: string; message: string }) {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: null }, error }),
    },
  } as unknown as SupabaseClient<Database>;
  return new DeviceManagementService(client, "a-device-key-pepper-that-is-at-least-32-bytes");
}
