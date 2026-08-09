import { Router, type Request, type Response } from "express";
import type {
  DeviceAccessTokenResponse,
  DeviceActivationKeyVerificationResponse,
  DeviceActivationResponse,
  DeviceApiError,
  DeviceBootstrap,
  DeviceRegistrationResponse,
} from "../../shared/deviceBootstrap";
import { createSupabaseDeviceRepositoryFromEnvironment } from "../repositories/deviceRepository";
import {
  DeviceApiFailure,
  DeviceIdentityService,
  type DeviceIdentityApplication,
} from "../services/deviceIdentityService";
import { DeviceTokenService } from "../services/deviceTokenService";

const REFRESH_COOKIE = "morrow_device_refresh";
const REGISTER_WINDOW_MS = 60_000;
const REGISTER_ATTEMPTS = 10;
const DEVICE_TYPES = new Set(["kiosk", "cashier_terminal", "kitchen_display", "order_display", "admin_terminal"]);

export function createDeviceRouter(
  serviceFactory: () => DeviceIdentityApplication = createDeviceIdentityServiceFromEnvironment,
) {
  const router = Router();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  let service: DeviceIdentityApplication | null = null;
  const resolveService = () => service ??= serviceFactory();

  router.post("/device/activation-key/verify", async (request: Request, response: Response<DeviceActivationKeyVerificationResponse | DeviceApiError>) => {
    try {
      enforceRateLimit(attempts, request.ip || request.socket.remoteAddress || "unknown");
      const secretKey = typeof request.body?.secretKey === "string" ? request.body.secretKey.trim() : "";
      if (!/^MORROW(?:-[A-Z0-9]{4}){6}$/i.test(secretKey)) {
        throw new DeviceApiFailure("invalid_setup_request", 400, "A valid device activation key is required.");
      }
      response.json(await resolveService().verifyActivationKey(secretKey));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/device/activate", async (request: Request, response: Response<DeviceActivationResponse | DeviceApiError>) => {
    try {
      enforceRateLimit(attempts, request.ip || request.socket.remoteAddress || "unknown");
      const secretKey = typeof request.body?.secretKey === "string" ? request.body.secretKey.trim() : "";
      const deviceFingerprint = typeof request.body?.deviceFingerprint === "string" ? request.body.deviceFingerprint.trim() : "";
      const deviceType = typeof request.body?.deviceType === "string" ? request.body.deviceType.trim() : "";
      const deviceName = typeof request.body?.deviceName === "string" ? request.body.deviceName.trim() : undefined;
      const appVersion = typeof request.body?.appVersion === "string" ? request.body.appVersion.trim() : undefined;
      const requestId = validUuid(request.body?.requestId) ? request.body.requestId : requestIdFrom(request);
      if (!/^MORROW(?:-[A-Z0-9]{4}){6}$/i.test(secretKey) || !validInstallationId(deviceFingerprint) || !DEVICE_TYPES.has(deviceType)
        || (deviceName && deviceName.length > 120) || (appVersion && appVersion.length > 80)) {
        throw new DeviceApiFailure("invalid_setup_request", 400, "A valid device activation request is required.");
      }
      diagnostic("activation_request_received");
      const result = await resolveService().activate({ secretKey, deviceFingerprint, deviceType: deviceType as DeviceActivationResponse["device"]["deviceType"], deviceName, appVersion, requestId });
      setRefreshCookie(request, response, result.refreshToken, result.refreshExpiresAt);
      const { refreshToken: _refreshToken, refreshExpiresAt: _refreshExpiresAt, ...publicResult } = result;
      diagnostic("activation_succeeded", result.device.id ? 201 : 200);
      response.status(201).json(publicResult);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/devices/register", async (request: Request, response: Response<DeviceRegistrationResponse | DeviceApiError>) => {
    try {
      enforceRateLimit(attempts, request.ip || request.socket.remoteAddress || "unknown");
      const secretKey = typeof request.body?.secretKey === "string" ? request.body.secretKey.trim() : "";
      if (secretKey.length < 48 || secretKey.length > 256) {
        throw new DeviceApiFailure("invalid_setup_request", 400, "A valid device secret key is required.");
      }
      diagnostic("registration_request_received");
      const result = await resolveService().register(secretKey);
      setRefreshCookie(request, response, result.refreshToken, result.refreshExpiresAt);
      diagnostic("registration_succeeded", 201);
      response.status(201).json({
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        expiresAt: result.expiresAt,
        bootstrap: result.bootstrap,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/devices/session/refresh", async (request: Request, response: Response<DeviceAccessTokenResponse | DeviceApiError>) => {
    try {
      const refreshToken = readCookie(request, REFRESH_COOKIE);
      if (!refreshToken) throw new DeviceApiFailure("invalid_device_session", 401, "The device session is invalid or expired.");
      response.json(await resolveService().refresh(refreshToken));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/devices/session", async (request: Request, response: Response<DeviceApiError>) => {
    try {
      await resolveService().revoke(readBearerToken(request));
      clearRefreshCookie(request, response);
      response.status(204).end();
    } catch (error) {
      clearRefreshCookie(request, response);
      sendError(response, error);
    }
  });

  router.post("/device/logout", async (request: Request, response: Response<DeviceApiError>) => {
    try {
      await resolveService().revoke(readBearerToken(request));
      clearRefreshCookie(request, response);
      response.status(204).end();
    } catch (error) {
      clearRefreshCookie(request, response);
      sendError(response, error);
    }
  });

  router.post("/device/heartbeat", async (request: Request, response: Response) => {
    try {
      const current = Number(request.body?.configurationVersion ?? 0);
      const appVersion = typeof request.body?.appVersion === "string" ? request.body.appVersion.trim().slice(0, 80) : null;
      const health = request.body?.connectionHealth === "degraded" ? "degraded" : "online";
      response.json(await resolveService().heartbeat(readBearerToken(request), Number.isSafeInteger(current) && current >= 0 ? current : 0, appVersion, health));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/device/bootstrap", async (request: Request, response: Response<DeviceBootstrap | DeviceApiError>) => {
    try {
      response.json(await resolveService().bootstrap(readBearerToken(request)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/device/menu", async (request: Request, response: Response) => {
    try {
      response.json(await resolveService().menu(readBearerToken(request)));
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

export const deviceRouter = createDeviceRouter();

export function createDeviceIdentityServiceFromEnvironment() {
  const tokenSecret = process.env.MORROW_DEVICE_TOKEN_SECRET?.trim();
  if (!tokenSecret) throw new Error("MORROW_DEVICE_TOKEN_SECRET is not configured.");
  const rawTtl = Number(process.env.MORROW_DEVICE_ACCESS_TOKEN_TTL_SECONDS ?? 900);
  return new DeviceIdentityService(
    createSupabaseDeviceRepositoryFromEnvironment(),
    new DeviceTokenService(tokenSecret, rawTtl),
  );
}

function readBearerToken(request: Request) {
  const authorization = request.header("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) throw new DeviceApiFailure("invalid_device_session", 401, "The device session is invalid or expired.");
  return match[1];
}

function readCookie(request: Request, name: string) {
  const cookies = request.header("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function setRefreshCookie(request: Request, response: Response, value: string, expiresAt: string) {
  response.cookie(REFRESH_COOKIE, value, {
    httpOnly: true,
    secure: refreshCookieIsSecure(request),
    sameSite: "strict",
    path: "/api/v1",
    expires: new Date(expiresAt),
  });
}

function clearRefreshCookie(request: Request, response: Response) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: refreshCookieIsSecure(request),
    sameSite: "strict",
    path: "/api/v1",
  });
}

function refreshCookieIsSecure(request: Request) {
  const forwardedProtocol = request.header("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const httpsRequest = request.secure || forwardedProtocol === "https";
  return httpsRequest || (process.env.NODE_ENV === "production" && !isLocalHostname(request.hostname));
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function enforceRateLimit(
  attempts: Map<string, { count: number; resetAt: number }>,
  key: string,
  now = Date.now(),
) {
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > REGISTER_ATTEMPTS) {
    throw new DeviceApiFailure("too_many_attempts", 429, "Too many device registration attempts. Try again shortly.");
  }
  if (attempts.size > 5_000) {
    for (const [candidate, value] of attempts) if (value.resetAt <= now) attempts.delete(candidate);
  }
}

function sendError(response: Response<DeviceApiError>, error: unknown) {
  if (error instanceof DeviceApiFailure) {
    diagnostic("device_request_failed", error.status, error.code);
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (process.env.NODE_ENV !== "production") console.error("[MORROW] Device API failure", error);
  diagnostic("device_request_failed", 503, "device_service_unavailable");
  response.status(503).json({ code: "device_service_unavailable", message: "The device service is unavailable." });
}

function diagnostic(event: string, status?: number, code?: string) {
  if (process.env.NODE_ENV !== "production") console.info("[MORROW device API]", { event, status, code });
}

function validInstallationId(value: string) {
  return value.length >= 8 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requestIdFrom(request: Request) {
  const header = request.header("x-request-id");
  return validUuid(header) ? header : crypto.randomUUID();
}
