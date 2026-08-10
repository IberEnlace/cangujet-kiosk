import { Router, type Request, type Response } from "express";
import type { CreateActivationKeyRequest } from "../../shared/deviceManagement";
import { DeviceApiFailure } from "../services/deviceIdentityService";
import {
  createDeviceManagementServiceFromEnvironment,
  DeviceManagementDependencyFailure,
  type DeviceManagementService,
} from "../services/deviceManagementService";

export function createDeviceManagementRouter(
  serviceFactory: () => DeviceManagementService = createDeviceManagementServiceFromEnvironment,
) {
  const router = Router();
  let service: DeviceManagementService | null = null;
  const resolve = () => service ??= serviceFactory();

  router.get("/admin/devices", async (request, response) => execute(request, response, async () => {
    response.json(await resolve().snapshot(staffToken(request)));
  }));

  router.post("/admin/device-activation-keys", async (request, response) => execute(request, response, async () => {
    const created = await resolve().createKey(staffToken(request), request.body as CreateActivationKeyRequest);
    response.status(201).json(created);
  }));

  router.post("/admin/device-activation-keys/:keyId/revoke", async (request, response) => execute(request, response, async () => {
    await resolve().revokeKey(staffToken(request), request.params.keyId);
    response.status(204).end();
  }));

  router.patch("/admin/devices/:deviceId", async (request, response) => execute(request, response, async () => {
    response.json(await resolve().updateDevice(staffToken(request), request.params.deviceId, request.body ?? {}));
  }));

  router.post("/admin/devices/:deviceId/revoke-session", async (request, response) => execute(request, response, async () => {
    await resolve().revokeDeviceSessions(staffToken(request), request.params.deviceId);
    response.status(204).end();
  }));

  router.post("/admin/devices/:deviceId/refresh-configuration", async (request, response) => execute(request, response, async () => {
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

async function execute(request: Request, response: Response, action: () => Promise<void>) {
  const requestId = requestIdFrom(request);
  response.setHeader("x-request-id", requestId);
  try {
    await action();
  } catch (error) {
    if (error instanceof DeviceApiFailure) {
      if (error.status >= 500) logDependencyFailure(request, requestId, error);
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    logDependencyFailure(request, requestId, error);
    response.status(503).json({ code: "device_service_unavailable", message: "The device service is unavailable." });
  }
}

function logDependencyFailure(request: Request, requestId: string, error: unknown) {
  const dependency = error instanceof DeviceManagementDependencyFailure ? error.dependency : "unknown";
  const operation = error instanceof DeviceManagementDependencyFailure ? error.operation : "route_execution";
  const errorName = error instanceof DeviceManagementDependencyFailure ? error.upstreamName : error instanceof Error ? error.name : "UnknownError";
  const errorCode = error instanceof DeviceManagementDependencyFailure ? error.upstreamCode : null;
  const upstreamStatus = error instanceof DeviceManagementDependencyFailure ? error.upstreamStatus : null;
  const causeCode = error instanceof DeviceManagementDependencyFailure ? error.upstreamCauseCode : null;
  console.error("[cangujet device management]", {
    event: "admin_device_dependency_failure",
    requestId,
    method: request.method,
    path: request.path,
    status: 503,
    dependency,
    operation,
    errorName,
    errorCode,
    causeCode,
    upstreamStatus,
  });
}

function requestIdFrom(request: Request) {
  const candidate = request.header("x-request-id");
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
