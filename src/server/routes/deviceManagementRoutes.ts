import { Router, type Request, type Response } from "express";
import type { CreateActivationKeyRequest } from "../../shared/deviceManagement";
import { DeviceApiFailure } from "../services/deviceIdentityService";
import { createDeviceManagementServiceFromEnvironment, type DeviceManagementService } from "../services/deviceManagementService";

export function createDeviceManagementRouter(
  serviceFactory: () => DeviceManagementService = createDeviceManagementServiceFromEnvironment,
) {
  const router = Router();
  let service: DeviceManagementService | null = null;
  const resolve = () => service ??= serviceFactory();

  router.get("/admin/devices", async (request, response) => execute(response, async () => {
    response.json(await resolve().snapshot(staffToken(request)));
  }));

  router.post("/admin/device-activation-keys", async (request, response) => execute(response, async () => {
    const created = await resolve().createKey(staffToken(request), request.body as CreateActivationKeyRequest);
    response.status(201).json(created);
  }));

  router.post("/admin/device-activation-keys/:keyId/revoke", async (request, response) => execute(response, async () => {
    await resolve().revokeKey(staffToken(request), request.params.keyId);
    response.status(204).end();
  }));

  router.patch("/admin/devices/:deviceId", async (request, response) => execute(response, async () => {
    response.json(await resolve().updateDevice(staffToken(request), request.params.deviceId, request.body ?? {}));
  }));

  router.post("/admin/devices/:deviceId/revoke-session", async (request, response) => execute(response, async () => {
    await resolve().revokeDeviceSessions(staffToken(request), request.params.deviceId);
    response.status(204).end();
  }));

  router.post("/admin/devices/:deviceId/refresh-configuration", async (request, response) => execute(response, async () => {
    response.json(await resolve().refreshDeviceConfiguration(staffToken(request), request.params.deviceId));
  }));

  return router;
}

export const deviceManagementRouter = createDeviceManagementRouter();

function staffToken(request: Request) {
  const match = (request.header("authorization") ?? "").match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) throw new DeviceApiFailure("invalid_staff_session", 401, "A valid staff session is required.");
  return match[1];
}

async function execute(response: Response, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof DeviceApiFailure) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (process.env.NODE_ENV !== "production") console.error("[MORROW device management]", error);
    response.status(503).json({ code: "device_service_unavailable", message: "The device service is unavailable." });
  }
}
