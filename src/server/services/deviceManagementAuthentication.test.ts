import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { DeviceApiFailure } from "./deviceIdentityService";
import { DeviceManagementDependencyFailure, DeviceManagementService } from "./deviceManagementService";

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
    (error: unknown) => error instanceof DeviceManagementDependencyFailure
      && error.status === 503
      && error.code === "staff_authentication_unavailable"
      && error.dependency === "supabase_auth"
      && error.operation === "staff_token_verification"
      && error.upstreamName === "AuthRetryableFetchError",
  );
});

test("valid non-Admin staff receives 403 rather than a dependency failure", async () => {
  const service = serviceWithMembershipResult({ data: [], error: null });
  await assert.rejects(
    service.snapshot("valid-non-admin-token"),
    (error: unknown) => error instanceof DeviceApiFailure
      && !(error instanceof DeviceManagementDependencyFailure)
      && error.status === 403
      && error.code === "admin_forbidden",
  );
});

test("Admin membership database failure remains a classified 503 without becoming 401", async () => {
  const service = serviceWithMembershipResult({
    data: null,
    error: { name: "PostgrestError", code: "PGRST000", message: "connection failed" },
  });
  await assert.rejects(
    service.snapshot("valid-admin-token"),
    (error: unknown) => error instanceof DeviceManagementDependencyFailure
      && error.status === 503
      && error.code === "device_management_repository_unavailable"
      && error.dependency === "supabase_rest"
      && error.operation === "admin_membership_lookup"
      && error.upstreamCode === "PGRST000",
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

function serviceWithMembershipResult(result: { data: unknown[] | null; error: { name: string; code: string; message: string } | null }) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "staff-user" } }, error: null }),
    },
    from: () => query,
  } as unknown as SupabaseClient<Database>;
  return new DeviceManagementService(client, "a-device-key-pepper-that-is-at-least-32-bytes");
}
