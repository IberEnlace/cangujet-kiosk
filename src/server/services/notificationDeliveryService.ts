import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

export type NotificationDeliveryRequest =
  | { type: "daily_sales_report" }
  | { type: "test"; recipient: string };

export type NotificationDeliveryResult = {
  ok: true;
  messageId: string;
  recipient: string;
  sentAt: string;
  results?: Array<{
    recipient: string;
    ok: boolean;
    messageId?: string;
    sentAt?: string;
  }>;
};

type EdgeFunctionResponse = Partial<NotificationDeliveryResult> & {
  code?: string;
  message?: string;
  suppressed?: boolean;
};

type Fetcher = typeof globalThis.fetch;

export class NotificationDeliveryFailure extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationDeliveryFailure";
  }
}

export interface NotificationDeliveryApplication {
  deliver(staffToken: string, input: NotificationDeliveryRequest): Promise<NotificationDeliveryResult>;
}

export class NotificationDeliveryService implements NotificationDeliveryApplication {
  constructor(
    private readonly url: string,
    private readonly serverKey: string,
    private readonly client: SupabaseClient<Database>,
    private readonly fetcher: Fetcher = globalThis.fetch,
  ) {}

  async deliver(staffToken: string, input: NotificationDeliveryRequest): Promise<NotificationDeliveryResult> {
    await this.authorizeAdmin(staffToken);
    const requestId = crypto.randomUUID();
    let response: Response;

    try {
      response = await this.fetcher(`${this.url}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffToken}`,
          apikey: this.serverKey,
          "content-type": "application/json",
          "x-morrow-request-id": requestId,
        },
        body: JSON.stringify(input),
      });
    } catch (error) {
      diagnostic("edge_function_unavailable", requestId, undefined, error);
      throw new NotificationDeliveryFailure(
        "notification_service_unavailable",
        503,
        "The notification service is temporarily unavailable.",
      );
    }

    const payload = await readJson(response);
    if (!response.ok || payload?.ok !== true) {
      const code = payload?.code ?? "notification_delivery_failed";
      diagnostic("edge_function_rejected", requestId, { status: response.status, code });
      throw new NotificationDeliveryFailure(
        code,
        downstreamStatus(response.status, code),
        safeMessage(payload, response.status),
      );
    }

    if (
      typeof payload.messageId !== "string"
      || typeof payload.recipient !== "string"
      || typeof payload.sentAt !== "string"
      || payload.suppressed === true
    ) {
      diagnostic("invalid_edge_function_response", requestId, { status: response.status });
      throw new NotificationDeliveryFailure(
        "invalid_notification_response",
        502,
        "The notification provider did not confirm delivery acceptance.",
      );
    }

    return {
      ok: true,
      messageId: payload.messageId,
      recipient: payload.recipient,
      sentAt: payload.sentAt,
      ...(Array.isArray(payload.results) ? { results: payload.results } : {}),
    };
  }

  private async authorizeAdmin(staffToken: string) {
    const user = await this.client.auth.getUser(staffToken);
    if (user.error || !user.data.user) {
      throw new NotificationDeliveryFailure(
        "invalid_staff_session",
        401,
        "A valid administrator session is required.",
      );
    }

    const profile = await this.client.from("profiles")
      .select("role,is_active,branch_id")
      .eq("id", user.data.user.id)
      .maybeSingle();
    if (profile.error) {
      diagnostic("admin_profile_lookup_failed", undefined, { code: profile.error.code });
      throw new NotificationDeliveryFailure(
        "notification_service_unavailable",
        503,
        "Administrator access could not be verified.",
      );
    }
    if (!profile.data?.is_active || profile.data.role !== "admin" || !profile.data.branch_id) {
      throw new NotificationDeliveryFailure(
        "admin_forbidden",
        403,
        "An active administrator account assigned to a branch is required.",
      );
    }
  }
}

export function createNotificationDeliveryServiceFromEnvironment() {
  const url = process.env.SUPABASE_URL?.trim();
  const serverKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !serverKey) {
    throw new Error("Server-side notification configuration is missing.");
  }
  const client = createClient<Database>(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new NotificationDeliveryService(url.replace(/\/$/, ""), serverKey, client);
}

async function readJson(response: Response): Promise<EdgeFunctionResponse | null> {
  try {
    return await response.json() as EdgeFunctionResponse;
  } catch {
    return null;
  }
}

function downstreamStatus(status: number, code: string) {
  if (status === 401 || code === "authentication_required") return 401;
  if (status === 403 || code === "admin_required") return 403;
  if (status === 400 || status === 405 || status === 422) return status;
  if (code === "email_not_configured" || code === "server_not_configured") return 503;
  return 502;
}

function safeMessage(payload: EdgeFunctionResponse | null, status: number) {
  if (typeof payload?.message === "string" && payload.message.length <= 500) return payload.message;
  return status >= 500
    ? "The notification provider did not accept the delivery request."
    : "The notification request could not be completed.";
}

function diagnostic(
  event: string,
  requestId?: string,
  details?: Record<string, unknown>,
  error?: unknown,
) {
  console.error("[cangujet notifications]", {
    event,
    requestId,
    ...details,
    ...(error instanceof Error ? { errorName: error.name } : {}),
  });
}
