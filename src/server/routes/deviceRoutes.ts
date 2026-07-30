import { Router, type Request, type Response } from "express";
import type {
  DeviceAccessTokenResponse,
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

export function createDeviceRouter(
  serviceFactory: () => DeviceIdentityApplication = createDeviceIdentityServiceFromEnvironment,
) {
  const router = Router();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  let service: DeviceIdentityApplication | null = null;
  const resolveService = () => service ??= serviceFactory();

  router.post("/devices/register", async (request: Request, response: Response<DeviceRegistrationResponse | DeviceApiError>) => {
    try {
      enforceRateLimit(attempts, request.ip || request.socket.remoteAddress || "unknown");
      const secretKey = typeof request.body?.secretKey === "string" ? request.body.secretKey.trim() : "";
      if (secretKey.length < 48 || secretKey.length > 256) {
        throw new DeviceApiFailure("invalid_device_key", 401, "The device secret key is invalid.");
      }
      const result = await resolveService().register(secretKey);
      setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
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
      clearRefreshCookie(response);
      response.status(204).end();
    } catch (error) {
      clearRefreshCookie(response);
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

  return router;
}

export const deviceRouter = createDeviceRouter();

function createDeviceIdentityServiceFromEnvironment() {
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

function setRefreshCookie(response: Response, value: string, expiresAt: string) {
  response.cookie(REFRESH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/devices",
    expires: new Date(expiresAt),
  });
}

function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/devices",
  });
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
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (process.env.NODE_ENV !== "production") console.error("[MORROW] Device API failure", error);
  response.status(503).json({ code: "device_service_unavailable", message: "The device service is unavailable." });
}
