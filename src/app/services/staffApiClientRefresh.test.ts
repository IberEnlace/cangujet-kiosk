import assert from "node:assert/strict";
import test from "node:test";
import { StaffApiError, staffApiRequest, type StaffApiDependencies } from "./staffApiClient";

test("expired staff access token performs one Supabase refresh and retries the Admin request once", async () => {
  const authorizations: string[] = [];
  let refreshes = 0;
  let invalidations = 0;
  const responses = [jsonResponse(401, { code: "invalid_staff_session" }), jsonResponse(200, { keys: [], devices: [], branches: [] })];
  const result = await staffApiRequest<{ keys: unknown[] }>("/api/v1/admin/devices", {}, dependencies({
    getCredential: async () => ({ token: "expired-staff-token", failure: null }),
    refreshCredential: async () => { refreshes += 1; return { token: "fresh-staff-token", failure: null }; },
    invalidateSession: async () => { invalidations += 1; },
    fetcher: async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      return responses.shift()!;
    },
  }));

  assert.deepEqual(result.keys, []);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 0);
  assert.deepEqual(authorizations, ["Bearer expired-staff-token", "Bearer fresh-staff-token"]);
});

test("a second Admin 401 is bounded and invalidates the staff session once", async () => {
  let requests = 0;
  let refreshes = 0;
  let invalidations = 0;
  await assert.rejects(
    staffApiRequest("/api/v1/admin/devices", {}, dependencies({
      getCredential: async () => ({ token: "expired-staff-token", failure: null }),
      refreshCredential: async () => { refreshes += 1; return { token: "fresh-but-rejected-token", failure: null }; },
      invalidateSession: async () => { invalidations += 1; },
      fetcher: async () => { requests += 1; return jsonResponse(401, { code: "invalid_staff_session" }); },
    })),
    (error: unknown) => error instanceof StaffApiError && error.kind === "unauthenticated" && error.status === 401,
  );
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 1);
});

test("403 and 503 Admin responses do not refresh or erase a valid staff session", async () => {
  for (const [status, kind] of [[403, "forbidden"], [503, "server"]] as const) {
    let refreshes = 0;
    let invalidations = 0;
    await assert.rejects(
      staffApiRequest("/api/v1/admin/devices", {}, dependencies({
        getCredential: async () => ({ token: "valid-staff-token", failure: null }),
        refreshCredential: async () => { refreshes += 1; return { token: null, failure: "unauthenticated" }; },
        invalidateSession: async () => { invalidations += 1; },
        fetcher: async () => jsonResponse(status, { code: status === 403 ? "admin_forbidden" : "staff_authentication_unavailable" }),
      })),
      (error: unknown) => error instanceof StaffApiError && error.kind === kind && error.status === status,
    );
    assert.equal(refreshes, 0);
    assert.equal(invalidations, 0);
  }
});

test("staff refresh dependency failure remains a network error without session destruction or retry loops", async () => {
  let requests = 0;
  let refreshes = 0;
  let invalidations = 0;
  await assert.rejects(
    staffApiRequest("/api/v1/admin/devices", {}, dependencies({
      getCredential: async () => ({ token: "expired-staff-token", failure: null }),
      refreshCredential: async () => { refreshes += 1; return { token: null, failure: "network" }; },
      invalidateSession: async () => { invalidations += 1; },
      fetcher: async () => { requests += 1; return jsonResponse(401, { code: "invalid_staff_session" }); },
    })),
    (error: unknown) => error instanceof StaffApiError && error.kind === "network" && error.code === "authentication_unreachable",
  );
  assert.equal(requests, 1);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 0);
});

function dependencies(overrides: StaffApiDependencies): StaffApiDependencies {
  return overrides;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
