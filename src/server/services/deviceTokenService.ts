import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { DeviceType } from "../../lib/supabase/database.types";

const ISSUER = "morrow-device-api";
const AUDIENCE = "morrow-kiosk";

export type DeviceTokenClaims = {
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
  sub: string;
  sid: string;
  jti: string;
  restaurant_id: string;
  branch_id: string;
  device_type: DeviceType;
  iat: number;
  exp: number;
};

export type DeviceTokenIdentity = {
  deviceId: string;
  sessionId: string;
  restaurantId: string;
  branchId: string;
  deviceType: DeviceType;
};

export class DeviceTokenService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds = 15 * 60,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("MORROW_DEVICE_TOKEN_SECRET must contain at least 32 bytes.");
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86_400) {
      throw new Error("Device access token TTL must be between 60 and 86400 seconds.");
    }
  }

  issue(identity: DeviceTokenIdentity) {
    const issuedAt = Math.floor(this.now() / 1000);
    const claims: DeviceTokenClaims = {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: identity.deviceId,
      sid: identity.sessionId,
      jti: randomUUID(),
      restaurant_id: identity.restaurantId,
      branch_id: identity.branchId,
      device_type: identity.deviceType,
      iat: issuedAt,
      exp: issuedAt + this.ttlSeconds,
    };
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode(claims);
    const unsigned = `${header}.${payload}`;
    const signature = sign(unsigned, this.secret);
    return {
      token: `${unsigned}.${signature}`,
      claims,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  verify(token: string): DeviceTokenClaims | null {
    const sections = token.split(".");
    if (sections.length !== 3) return null;
    const unsigned = `${sections[0]}.${sections[1]}`;
    const expected = Buffer.from(sign(unsigned, this.secret), "base64url");
    const actual = Buffer.from(sections[2], "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const header = JSON.parse(Buffer.from(sections[0], "base64url").toString("utf8")) as Record<string, unknown>;
      const claims = JSON.parse(Buffer.from(sections[1], "base64url").toString("utf8")) as Partial<DeviceTokenClaims>;
      const now = Math.floor(this.now() / 1000);
      if (header.alg !== "HS256" || header.typ !== "JWT") return null;
      if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) return null;
      if (!claims.sub || !claims.sid || !claims.jti || !claims.restaurant_id || !claims.branch_id || !claims.device_type) return null;
      if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || Number(claims.exp) <= now) return null;
      return claims as DeviceTokenClaims;
    } catch {
      return null;
    }
  }
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}
