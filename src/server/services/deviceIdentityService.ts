import { randomBytes, randomUUID } from "node:crypto";
import type { DeviceRow } from "../../lib/supabase/database.types";
import type {
  BootstrapPaymentMethod,
  BootstrapServiceMode,
  DeviceAccessTokenResponse,
  DeviceBootstrap,
  DeviceRegistrationResponse,
} from "../../shared/deviceBootstrap";
import type {
  DeviceBootstrapData,
  DeviceRepository,
  DeviceSessionIdentity,
} from "../repositories/deviceRepository";
import {
  hashOpaqueToken,
  opaqueTokenMatchesHash,
  parseDeviceSecretKey,
  verifyDeviceSecret,
} from "./deviceCredentialService";
import { DeviceTokenService, type DeviceTokenClaims } from "./deviceTokenService";

const REFRESH_TOKEN_DAYS = 30;
const PAYMENT_METHODS = new Set<BootstrapPaymentMethod>(["card", "pay_at_cashier", "qr"]);
const SERVICE_MODES = new Set<BootstrapServiceMode>(["dine_in", "take_away"]);

export class DeviceApiFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeviceApiFailure";
  }
}

export type DeviceRegistrationResult = DeviceRegistrationResponse & {
  refreshToken: string;
  refreshExpiresAt: string;
};

export interface DeviceIdentityApplication {
  register(secretKey: string): Promise<DeviceRegistrationResult>;
  refresh(refreshToken: string): Promise<DeviceAccessTokenResponse>;
  bootstrap(accessToken: string): Promise<DeviceBootstrap>;
  revoke(accessToken: string): Promise<void>;
}

export class DeviceIdentityService implements DeviceIdentityApplication {
  constructor(
    private readonly repository: DeviceRepository,
    private readonly tokens: DeviceTokenService,
    private readonly now: () => Date = () => new Date(),
    private readonly secretVerifier: typeof verifyDeviceSecret = verifyDeviceSecret,
  ) {}

  async register(secretKey: string): Promise<DeviceRegistrationResult> {
    const parsed = parseDeviceSecretKey(secretKey);
    if (!parsed) throw invalidKey();
    const identity = await this.repository.findCredential(parsed.publicKeyId);
    if (!identity) throw invalidKey();
    const { credential, device } = identity;
    if (credential.revoked_at) {
      await this.safeAudit(device.id, credential.id, "registration_revoked_credential");
      throw invalidKey();
    }
    if (credential.expires_at && Date.parse(credential.expires_at) <= this.now().getTime()) {
      await this.safeAudit(device.id, credential.id, "registration_expired_credential");
      throw new DeviceApiFailure("credential_expired", 401, "This device credential has expired.");
    }
    if (!await this.secretVerifier(parsed.secret, credential.secret_hash)) {
      await this.safeAudit(device.id, credential.id, "registration_invalid_secret");
      throw invalidKey();
    }
    assertActiveDevice(device);
    const bootstrap = await this.loadActiveBootstrap(device.id);
    const sessionId = randomUUID();
    const issued = this.tokens.issue(toTokenIdentity(device, sessionId));
    const refreshToken = `drt_${sessionId}_${randomBytes(48).toString("base64url")}`;
    const refreshExpiresAt = new Date(this.now().getTime() + REFRESH_TOKEN_DAYS * 86_400_000).toISOString();
    await this.repository.createSession({
      id: sessionId,
      device_id: device.id,
      credential_id: credential.id,
      access_token_hash: hashOpaqueToken(issued.token),
      refresh_token_hash: hashOpaqueToken(refreshToken),
      expires_at: issued.expiresAt,
      refresh_expires_at: refreshExpiresAt,
    });
    try {
      await this.repository.recordRegistration(device.id, credential.id);
    } catch (error) {
      await this.repository.revokeSession(sessionId).catch(() => undefined);
      throw error;
    }
    return {
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresAt: issued.expiresAt,
      refreshToken,
      refreshExpiresAt,
      bootstrap,
    };
  }

  async refresh(refreshToken: string): Promise<DeviceAccessTokenResponse> {
    if (!/^drt_[0-9a-f-]{36}_[A-Za-z0-9_-]{48,128}$/i.test(refreshToken)) {
      throw unauthorizedSession();
    }
    const identity = await this.repository.getSessionByRefreshHash(hashOpaqueToken(refreshToken));
    if (!identity || !isSessionRefreshable(identity, this.now())) throw unauthorizedSession();
    assertActiveDevice(identity.device);
    const issued = this.tokens.issue(toTokenIdentity(identity.device, identity.session.id));
    await this.repository.updateSessionAccess(identity.session.id, hashOpaqueToken(issued.token), issued.expiresAt);
    return { accessToken: issued.token, tokenType: "Bearer", expiresAt: issued.expiresAt };
  }

  async bootstrap(accessToken: string): Promise<DeviceBootstrap> {
    const authenticated = await this.authenticate(accessToken);
    const bootstrap = await this.loadActiveBootstrap(authenticated.device.id);
    await this.repository.touchDeviceSession(authenticated.device.id, authenticated.session.id);
    return bootstrap;
  }

  async revoke(accessToken: string) {
    const authenticated = await this.authenticate(accessToken);
    await this.repository.revokeSession(authenticated.session.id);
    await this.safeAudit(authenticated.device.id, authenticated.credential.id, "device_session_revoked");
  }

  private async authenticate(accessToken: string) {
    const claims = this.tokens.verify(accessToken);
    if (!claims) throw unauthorizedSession();
    const identity = await this.repository.getSession(claims.sid);
    if (!identity || !isSessionUsable(identity, accessToken, claims, this.now())) throw unauthorizedSession();
    assertActiveDevice(identity.device);
    return identity;
  }

  private async loadActiveBootstrap(deviceId: string) {
    const data = await this.repository.loadBootstrap(deviceId);
    if (!data) {
      throw new DeviceApiFailure("configuration_error", 503, "The device configuration is incomplete.");
    }
    if (data.restaurant.status !== "active" || !data.branch.is_active) {
      throw new DeviceApiFailure("device_disabled", 403, "This device is disabled.");
    }
    return mapBootstrap(data);
  }

  private async safeAudit(deviceId: string, credentialId: string, eventType: string) {
    try {
      await this.repository.recordAudit(deviceId, credentialId, eventType);
    } catch {
      // Authentication outcome must not reveal whether audit storage is available.
    }
  }
}

function mapBootstrap(data: DeviceBootstrapData): DeviceBootstrap {
  const languageByCode = new Map(data.languages.map(language => [language.code, language]));
  const languages = data.languageAssignments.flatMap(assignment => {
    const language = languageByCode.get(assignment.language_code);
    return language ? [{
      code: language.code,
      name: language.name,
      nativeName: language.native_name,
      locale: language.locale,
      direction: language.direction,
      default: assignment.is_default,
    }] : [];
  });
  const serviceModes = data.branch.service_modes.filter(
    (value): value is BootstrapServiceMode => SERVICE_MODES.has(value as BootstrapServiceMode),
  );
  const enabledMethods = data.payment.enabled_methods.filter(
    (value): value is BootstrapPaymentMethod => PAYMENT_METHODS.has(value as BootstrapPaymentMethod),
  );
  const openingHours = data.openingHours.map(value => ({
    dayOfWeek: value.day_of_week,
    sequence: value.sequence,
    opensAt: value.opens_at,
    closesAt: value.closes_at,
    closed: value.is_closed,
  }));
  const tokens = primitiveRecord(data.theme.tokens);
  const paymentPublicOptions = record(data.payment.provider_public_config);
  const voiceSettings = record(data.nori.voice_settings);
  const noriPublicOptions = record(data.nori.public_options);
  const videos = Array.isArray(data.idle.videos)
    ? data.idle.videos.filter((value): value is string => typeof value === "string")
    : [];
  return {
    restaurant: {
      id: data.restaurant.id,
      name: data.restaurant.name,
      slug: data.restaurant.slug,
      logoUrl: data.restaurant.logo_url,
    },
    branch: {
      id: data.branch.id,
      name: data.branch.name,
      code: data.branch.code,
      currency: data.branch.currency,
      taxRate: Number(data.branch.tax_rate),
      timezone: data.branch.timezone,
      serviceModes,
      openingHours,
    },
    device: {
      id: data.device.id,
      type: data.device.device_type,
      name: data.device.name,
      status: "active",
      configVersion: Number(data.device.config_version),
      lastSeenAt: data.device.last_seen_at,
    },
    configVersion: Number(data.device.config_version),
    theme: { id: data.theme.id, name: data.theme.name, tokens },
    logoUrl: data.restaurant.logo_url,
    languages,
    currency: data.branch.currency,
    taxRate: Number(data.branch.tax_rate),
    serviceModes,
    openingHours,
    paymentConfiguration: {
      enabledMethods,
      receiptPrintingEnabled: data.payment.receipt_printing_enabled,
      publicOptions: paymentPublicOptions,
    },
    noriConfiguration: {
      enabled: data.nori.enabled,
      voiceEnabled: data.nori.voice_enabled,
      voiceSettings,
      publicOptions: noriPublicOptions,
    },
    idleScreenConfiguration: {
      timeoutSeconds: data.idle.timeout_seconds,
      videoIntervalMs: data.idle.video_interval_ms,
      minimumPlaybackMs: data.idle.minimum_playback_ms,
      transitionMs: data.idle.transition_ms,
      title: data.idle.title,
      slogan: data.idle.slogan,
      description: data.idle.description,
      buttonLabel: data.idle.button_label,
      touchLabel: data.idle.touch_label,
      videos,
    },
    publishedMenuId: data.menu.id,
    publishedMenuVersion: Number(data.menu.version),
    realtimeConfiguration: {
      enabled: false,
      transport: "private_broadcast",
      branchTopic: `branch:${data.branch.id}:configuration`,
      deviceTopic: `device:${data.device.id}:configuration`,
    },
  };
}

function assertActiveDevice(device: DeviceRow) {
  if (device.status !== "active") {
    throw new DeviceApiFailure("device_disabled", 403, "This device is disabled.");
  }
}

function isSessionRefreshable(identity: DeviceSessionIdentity, now: Date) {
  return !identity.session.revoked_at
    && Boolean(identity.session.refresh_token_hash)
    && Boolean(identity.session.refresh_expires_at)
    && Date.parse(identity.session.refresh_expires_at!) > now.getTime()
    && !identity.credential.revoked_at
    && (!identity.credential.expires_at || Date.parse(identity.credential.expires_at) > now.getTime());
}

function isSessionUsable(identity: DeviceSessionIdentity, token: string, claims: DeviceTokenClaims, now: Date) {
  return !identity.session.revoked_at
    && Date.parse(identity.session.expires_at) > now.getTime()
    && opaqueTokenMatchesHash(token, identity.session.access_token_hash)
    && identity.device.id === claims.sub
    && identity.device.restaurant_id === claims.restaurant_id
    && identity.device.branch_id === claims.branch_id
    && identity.device.device_type === claims.device_type
    && !identity.credential.revoked_at
    && (!identity.credential.expires_at || Date.parse(identity.credential.expires_at) > now.getTime());
}

function toTokenIdentity(device: DeviceRow, sessionId: string) {
  return {
    deviceId: device.id,
    sessionId,
    restaurantId: device.restaurant_id,
    branchId: device.branch_id,
    deviceType: device.device_type,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function primitiveRecord(value: unknown): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(record(value)).filter((entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])),
  );
}

function invalidKey() {
  return new DeviceApiFailure("invalid_device_key", 401, "The device secret key is invalid.");
}

function unauthorizedSession() {
  return new DeviceApiFailure("invalid_device_session", 401, "The device session is invalid or expired.");
}
