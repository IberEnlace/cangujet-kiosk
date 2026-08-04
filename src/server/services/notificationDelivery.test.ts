import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, test } from "node:test";
import express from "express";
import { createNotificationRouter } from "../routes/notificationRoutes";
import {
  NotificationDeliveryFailure,
  NotificationDeliveryService,
  type NotificationDeliveryApplication,
  type NotificationDeliveryRequest,
} from "./notificationDeliveryService";

const accepted = {
  ok: true as const,
  messageId: "provider-message-1",
  recipient: "admin@example.com",
  sentAt: "2026-08-04T12:00:00.000Z",
};

describe("admin notification delivery routes", { concurrency: false }, () => {
  test("daily reports use the authenticated same-origin backend route", async () => {
    const calls: Array<{ token: string; input: NotificationDeliveryRequest }> = [];
    const service: NotificationDeliveryApplication = {
      async deliver(token, input) {
        calls.push({ token, input });
        return accepted;
      },
    };
    await withServer(service, async base => {
      const response = await fetch(`${base}/api/v1/admin/notifications/daily-report`, {
        method: "POST",
        headers: { authorization: "Bearer staff-session-token" },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), accepted);
      assert.deepEqual(calls, [{ token: "staff-session-token", input: { type: "daily_sales_report" } }]);
    });
  });

  test("routes reject missing staff sessions and malformed test recipients", async () => {
    const service: NotificationDeliveryApplication = { async deliver() { return accepted; } };
    await withServer(service, async base => {
      const unauthorized = await fetch(`${base}/api/v1/admin/notifications/daily-report`, { method: "POST" });
      assert.equal(unauthorized.status, 401);
      assert.equal((await unauthorized.json()).code, "invalid_staff_session");

      const invalid = await fetch(`${base}/api/v1/admin/notifications/test`, {
        method: "POST",
        headers: { authorization: "Bearer staff-session-token", "content-type": "application/json" },
        body: JSON.stringify({ recipient: "not-an-email" }),
      });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).code, "invalid_email");
    });
  });

  test("safe provider failures preserve the upstream status and code", async () => {
    const service: NotificationDeliveryApplication = {
      async deliver() {
        throw new NotificationDeliveryFailure(
          "provider_rejected",
          502,
          "The configured sender is not verified.",
        );
      },
    };
    await withServer(service, async base => {
      const response = await fetch(`${base}/api/v1/admin/notifications/daily-report`, {
        method: "POST",
        headers: { authorization: "Bearer staff-session-token" },
      });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        ok: false,
        code: "provider_rejected",
        message: "The configured sender is not verified.",
      });
    });
  });
});

describe("server-side notification authorization", () => {
  test("verifies the active admin before forwarding the request with server-only credentials", async () => {
    const authTokens: string[] = [];
    const edgeRequests: Array<{ input: string; init?: RequestInit }> = [];
    const client = fakeClient("admin", true, authTokens);
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      edgeRequests.push({ input: String(input), init });
      return new Response(JSON.stringify(accepted), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const service = new NotificationDeliveryService(
      "https://project.supabase.co",
      "server-secret-key",
      client,
      fetcher,
    );

    assert.deepEqual(await service.deliver("staff-session-token", { type: "daily_sales_report" }), accepted);
    assert.deepEqual(authTokens, ["staff-session-token"]);
    assert.equal(edgeRequests[0].input, "https://project.supabase.co/functions/v1/send-notification-email");
    const headers = new Headers(edgeRequests[0].init?.headers);
    assert.equal(headers.get("authorization"), "Bearer staff-session-token");
    assert.equal(headers.get("apikey"), "server-secret-key");
    assert.equal(edgeRequests[0].init?.body, JSON.stringify({ type: "daily_sales_report" }));
  });

  test("rejects inactive or non-admin profiles before contacting the Edge Function", async () => {
    let edgeCalls = 0;
    const service = new NotificationDeliveryService(
      "https://project.supabase.co",
      "server-secret-key",
      fakeClient("cashier", true, []),
      (async () => { edgeCalls += 1; return new Response(); }) as typeof fetch,
    );
    await assert.rejects(
      service.deliver("staff-session-token", { type: "daily_sales_report" }),
      (error: unknown) => error instanceof NotificationDeliveryFailure
        && error.status === 403
        && error.code === "admin_forbidden",
    );
    assert.equal(edgeCalls, 0);
  });
});

async function withServer(
  service: NotificationDeliveryApplication,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createNotificationRouter(() => service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function fakeClient(role: string, isActive: boolean, authTokens: string[]) {
  return {
    auth: {
      async getUser(token: string) {
        authTokens.push(token);
        return { data: { user: { id: "admin-user-id" } }, error: null };
      },
    },
    from(table: string) {
      assert.equal(table, "profiles");
      return {
        select(columns: string) {
          assert.equal(columns, "role,is_active,branch_id");
          return {
            eq(column: string, value: string) {
              assert.equal(column, "id");
              assert.equal(value, "admin-user-id");
              return {
                async maybeSingle() {
                  return {
                    data: { role, is_active: isActive, branch_id: "branch-id" },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof NotificationDeliveryService>[2];
}
