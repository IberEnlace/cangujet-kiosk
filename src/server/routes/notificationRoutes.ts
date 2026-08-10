import { Router, type Request, type Response } from "express";
import {
  NotificationDeliveryFailure,
  createNotificationDeliveryServiceFromEnvironment,
  type NotificationDeliveryApplication,
  type NotificationDeliveryRequest,
} from "../services/notificationDeliveryService";

export function createNotificationRouter(
  serviceFactory: () => NotificationDeliveryApplication = createNotificationDeliveryServiceFromEnvironment,
) {
  const router = Router();
  let service: NotificationDeliveryApplication | null = null;
  const resolve = () => service ??= serviceFactory();

  router.post("/admin/notifications/daily-report", async (request, response) => {
    await execute(response, async () => {
      const result = await resolve().deliver(staffToken(request), { type: "daily_sales_report" });
      response.status(200).json(result);
    });
  });

  router.post("/admin/notifications/test", async (request, response) => {
    await execute(response, async () => {
      const recipient = typeof request.body?.recipient === "string"
        ? request.body.recipient.trim().toLowerCase()
        : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new NotificationDeliveryFailure(
          "invalid_email",
          400,
          "Enter a valid recipient email.",
        );
      }
      const input: NotificationDeliveryRequest = { type: "test", recipient };
      response.status(200).json(await resolve().deliver(staffToken(request), input));
    });
  });

  return router;
}

export const notificationRouter = createNotificationRouter();

function staffToken(request: Request) {
  const match = (request.header("authorization") ?? "").match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) {
    throw new NotificationDeliveryFailure(
      "invalid_staff_session",
      401,
      "A valid administrator session is required.",
    );
  }
  return match[1];
}

async function execute(response: Response, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof NotificationDeliveryFailure) {
      response.status(error.status).json({ ok: false, code: error.code, message: error.message });
      return;
    }
    console.error("[cangujet notifications]", {
      event: "notification_route_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    response.status(503).json({
      ok: false,
      code: "notification_service_unavailable",
      message: "The notification service is temporarily unavailable.",
    });
  }
}
