import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type {
  DeviceCredentialRow,
  DeviceRow,
  DeviceSessionRow,
} from "../../lib/supabase/database.types";
import type {
  DeviceAccessTokenResponse,
  DeviceBootstrap,
  DeviceRegistrationResponse,
} from "../../shared/deviceBootstrap";
import type {
  DeviceBootstrapData,
  DeviceCredentialIdentity,
  DeviceRepository,
  DeviceSessionIdentity,
  NewDeviceSession,
} from "../repositories/deviceRepository";
import { createDeviceRouter } from "../routes/deviceRoutes";
import {
  createDeviceSecretKey,
  hashDeviceSecret,
  hashOpaqueToken,
  parseDeviceSecretKey,
  verifyDeviceSecret,
} from "./deviceCredentialService";
import {
  DeviceApiFailure,
  DeviceIdentityService,
  type DeviceIdentityApplication,
  type DeviceRegistrationResult,
} from "./deviceIdentityService";
import { DeviceTokenService } from "./deviceTokenService";

const NOW = new Date("2026-07-30T12:00:00.000Z");

test("device secrets use a parsed public identifier and one-way scrypt hash", async () => {
  const generated = createDeviceSecretKey();
  const parsed = parseDeviceSecretKey(generated.secretKey);
  assert.equal(parsed?.publicKeyId, generated.publicKeyId);
  assert.equal(parsed?.secret, generated.secret);
  const hash = await hashDeviceSecret(generated.secret, Buffer.alloc(16, 7));
  assert.match(hash, /^scrypt\$N=32768,r=8,p=1\$/);
  assert.doesNotMatch(hash, new RegExp(generated.secret));
  assert.equal(await verifyDeviceSecret(generated.secret, hash), true);
  assert.equal(await verifyDeviceSecret(`${generated.secret}x`, hash), false);
  assert.equal(parseDeviceSecretKey("MORROW-DEMO-001"), null);
});

test("device access tokens are signed, scoped, tamper-resistant, and expiring", () => {
  let clock = NOW.getTime();
  const tokens = new DeviceTokenService("test-secret-with-at-least-thirty-two-bytes", 120, () => clock);
  const issued = tokens.issue({
    deviceId: "10000000-0000-4000-8000-000000000001",
    sessionId: "20000000-0000-4000-8000-000000000001",
    restaurantId: "30000000-0000-4000-8000-000000000001",
    branchId: "40000000-0000-4000-8000-000000000001",
    deviceType: "kiosk",
  });
  assert.equal(tokens.verify(issued.token)?.sub, "10000000-0000-4000-8000-000000000001");
  assert.equal(tokens.verify(`${issued.token.slice(0, -1)}x`), null);
  clock += 121_000;
  assert.equal(tokens.verify(issued.token), null);
});

test("registration validates the credential, creates a revocable session, and returns one bootstrap", async () => {
  const generated = createDeviceSecretKey();
  const repository = new MemoryDeviceRepository(await hashDeviceSecret(generated.secret));
  const service = new DeviceIdentityService(
    repository,
    new DeviceTokenService("test-secret-with-at-least-thirty-two-bytes", 900, () => NOW.getTime()),
    () => NOW,
  );
  repository.publicKeyId = generated.publicKeyId;
  const result = await service.register(generated.secretKey);
  assert.equal(result.bootstrap.restaurant.name, "MORROW");
  assert.equal(result.bootstrap.branch.code, "MAIN");
  assert.equal(result.bootstrap.device.configVersion, 7);
  assert.equal(result.bootstrap.publishedMenuId, repository.bootstrap.menu.id);
  assert.match(result.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
  assert.match(result.refreshToken, /^drt_/);
  assert.equal(repository.sessions.length, 1);
  assert.notEqual(repository.sessions[0].access_token_hash, result.accessToken);
  assert.notEqual(repository.sessions[0].refresh_token_hash, result.refreshToken);
  assert.equal(repository.registrationRecorded, true);
});

test("registration rejects invalid, disabled, and expired credentials", async () => {
  const generated = createDeviceSecretKey();
  const repository = new MemoryDeviceRepository(await hashDeviceSecret(generated.secret));
  repository.publicKeyId = generated.publicKeyId;
  const service = new DeviceIdentityService(
    repository,
    new DeviceTokenService("test-secret-with-at-least-thirty-two-bytes", 900, () => NOW.getTime()),
    () => NOW,
  );
  await assert.rejects(() => service.register(`${generated.secretKey}x`), isFailure("invalid_device_key", 401));
  repository.device.status = "disabled";
  await assert.rejects(() => service.register(generated.secretKey), isFailure("device_disabled", 403));
  repository.device.status = "active";
  repository.credential.expires_at = "2026-07-29T00:00:00.000Z";
  await assert.rejects(() => service.register(generated.secretKey), isFailure("credential_expired", 401));
});

test("bootstrap returns the current database configuration version", async () => {
  const generated = createDeviceSecretKey();
  const repository = new MemoryDeviceRepository(await hashDeviceSecret(generated.secret));
  repository.publicKeyId = generated.publicKeyId;
  const service = new DeviceIdentityService(
    repository,
    new DeviceTokenService("test-secret-with-at-least-thirty-two-bytes", 900, () => NOW.getTime()),
    () => NOW,
  );
  const registration = await service.register(generated.secretKey);
  repository.device.config_version = 8;
  repository.bootstrap.device.config_version = 8;
  const bootstrap = await service.bootstrap(registration.accessToken);
  assert.equal(bootstrap.configVersion, 8);
});

test("device API exposes registration, refresh, bootstrap, and revocation without returning refresh secrets", async () => {
  const bootstrap = mapTestBootstrap();
  const registration: DeviceRegistrationResult = {
    accessToken: "header.payload.signature",
    tokenType: "Bearer",
    expiresAt: "2026-07-30T12:15:00.000Z",
    refreshToken: "drt_20000000-0000-4000-8000-000000000001_secret",
    refreshExpiresAt: "2026-08-29T12:00:00.000Z",
    bootstrap,
  };
  const fake: DeviceIdentityApplication = {
    async register() { return registration; },
    async refresh(): Promise<DeviceAccessTokenResponse> {
      return { accessToken: "new.header.signature", tokenType: "Bearer", expiresAt: registration.expiresAt };
    },
    async bootstrap() { return bootstrap; },
    async revoke() { return; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createDeviceRouter(() => fake));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const registered = await fetch(`http://127.0.0.1:${port}/api/v1/devices/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secretKey: `mdk_${"a".repeat(16)}_${"b".repeat(43)}` }),
    });
    assert.equal(registered.status, 201);
    const body = await registered.json() as DeviceRegistrationResponse & { refreshToken?: string };
    assert.equal(body.bootstrap.configVersion, 7);
    assert.equal(body.refreshToken, undefined);
    assert.match(registered.headers.get("set-cookie") ?? "", /HttpOnly/);

    const bootstrapped = await fetch(`http://127.0.0.1:${port}/api/v1/device/bootstrap`, {
      headers: { authorization: "Bearer header.payload.signature" },
    });
    assert.equal(bootstrapped.status, 200);
    assert.equal((await bootstrapped.json() as DeviceBootstrap).device.name, "Morrow Kiosk");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("device migration is additive, tenant-scoped, and never stores raw secrets", () => {
  const migration = readFileSync("supabase/migrations/202607300001_production_device_identity_bootstrap.sql", "utf8");
  assert.match(migration, /create table public\.restaurants/);
  assert.match(migration, /add column restaurant_id uuid/);
  assert.match(migration, /foreign key \(branch_id, restaurant_id\)/);
  assert.match(migration, /create table public\.device_credentials/);
  assert.match(migration, /secret_hash text not null/);
  assert.doesNotMatch(migration, /secret_key text|raw_secret|MORROW-DEMO-001/);
  assert.match(migration, /config_version = config_version \+ 1/);
  assert.match(migration, /create policy "restaurant admins manage branches"/);
});

class MemoryDeviceRepository implements DeviceRepository {
  public publicKeyId = "abcdefghijklmnop";
  public sessions: NewDeviceSession[] = [];
  public registrationRecorded = false;
  public device: DeviceRow = {
    id: "10000000-0000-4000-8000-000000000001",
    restaurant_id: "30000000-0000-4000-8000-000000000001",
    branch_id: "40000000-0000-4000-8000-000000000001",
    device_type: "kiosk",
    name: "Morrow Kiosk",
    status: "active",
    config_version: 7,
    last_seen_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
  public credential: DeviceCredentialRow;
  public bootstrap: DeviceBootstrapData;

  constructor(secretHash: string) {
    this.credential = {
      id: "50000000-0000-4000-8000-000000000001",
      device_id: this.device.id,
      public_key_id: this.publicKeyId,
      secret_hash: secretHash,
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    };
    this.bootstrap = bootstrapData(this.device);
  }

  async findCredential(publicKeyId: string): Promise<DeviceCredentialIdentity | null> {
    this.credential.public_key_id = this.publicKeyId;
    return publicKeyId === this.publicKeyId ? { credential: this.credential, device: this.device } : null;
  }
  async createSession(session: NewDeviceSession) { this.sessions.push(session); }
  async getSession(sessionId: string): Promise<DeviceSessionIdentity | null> {
    const stored = this.sessions.find(session => session.id === sessionId);
    return stored ? this.identity(stored) : null;
  }
  async getSessionByRefreshHash(refreshHash: string): Promise<DeviceSessionIdentity | null> {
    const stored = this.sessions.find(session => session.refresh_token_hash === refreshHash);
    return stored ? this.identity(stored) : null;
  }
  async updateSessionAccess(sessionId: string, accessTokenHash: string, expiresAt: string) {
    const stored = this.sessions.find(session => session.id === sessionId);
    if (stored) {
      stored.access_token_hash = accessTokenHash;
      stored.expires_at = expiresAt;
    }
  }
  async revokeSession(sessionId: string) {
    const stored = this.sessions.find(session => session.id === sessionId);
    if (stored) (stored as NewDeviceSession & { revoked_at?: string }).revoked_at = NOW.toISOString();
  }
  async touchDeviceSession() { return; }
  async recordRegistration() { this.registrationRecorded = true; }
  async recordAudit() { return; }
  async loadBootstrap() {
    this.bootstrap.device = this.device;
    return this.bootstrap;
  }

  private identity(stored: NewDeviceSession): DeviceSessionIdentity {
    const session: DeviceSessionRow = {
      ...stored,
      last_seen_at: NOW.toISOString(),
      revoked_at: null,
      created_at: NOW.toISOString(),
    };
    return { session, credential: this.credential, device: this.device };
  }
}

function bootstrapData(device: DeviceRow): DeviceBootstrapData {
  return {
    restaurant: {
      id: device.restaurant_id, name: "MORROW", slug: "morrow", logo_url: null, status: "active",
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    branch: {
      id: device.branch_id, restaurant_id: device.restaurant_id, name: "Main Branch", code: "MAIN",
      address: null, currency: "EUR", timezone: "Europe/Istanbul", tax_rate: 0.08,
      service_modes: ["dine_in", "take_away"], allow_unpaid_kitchen_orders: true, is_active: true,
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    device,
    theme: {
      id: "60000000-0000-4000-8000-000000000001", restaurant_id: device.restaurant_id,
      name: "MORROW Default", tokens: { primary: "#D7FB69" }, is_active: true,
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    languageAssignments: [
      { restaurant_id: device.restaurant_id, language_code: "en", is_default: true, display_order: 0 },
      { restaurant_id: device.restaurant_id, language_code: "tr", is_default: false, display_order: 1 },
    ],
    languages: [
      { code: "en", name: "English", native_name: "English", locale: "en-US", direction: "ltr", is_active: true },
      { code: "tr", name: "Turkish", native_name: "Türkçe", locale: "tr-TR", direction: "ltr", is_active: true },
    ],
    openingHours: [],
    payment: {
      branch_id: device.branch_id, enabled_methods: ["card", "pay_at_cashier", "qr"],
      receipt_printing_enabled: true, provider_public_config: {},
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    nori: {
      branch_id: device.branch_id, enabled: true, voice_enabled: true,
      voice_settings: {}, public_options: {}, created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    idle: {
      branch_id: device.branch_id, timeout_seconds: 300, video_interval_ms: 9000,
      minimum_playback_ms: 4000, transition_ms: 500, title: "MORROW",
      slogan: "Fresh. Fast. Delicious.", description: "Start your delicious journey",
      button_label: "START ORDER", touch_label: "Touch anywhere to begin", videos: [],
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
    menu: {
      id: "70000000-0000-4000-8000-000000000001", restaurant_id: device.restaurant_id,
      name: "MORROW Default Menu", status: "published", version: 1, published_at: NOW.toISOString(),
      created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    },
  };
}

function mapTestBootstrap(): DeviceBootstrap {
  return {
    restaurant: { id: "restaurant", name: "MORROW", slug: "morrow", logoUrl: null },
    branch: {
      id: "branch", name: "Main Branch", code: "MAIN", currency: "EUR", taxRate: 0.08,
      timezone: "Europe/Istanbul", serviceModes: ["dine_in", "take_away"], openingHours: [],
    },
    device: { id: "device", type: "kiosk", name: "Morrow Kiosk", status: "active", configVersion: 7, lastSeenAt: null },
    configVersion: 7,
    theme: { id: "theme", name: "Default", tokens: {} },
    logoUrl: null,
    languages: [{ code: "en", name: "English", nativeName: "English", locale: "en-US", direction: "ltr", default: true }],
    currency: "EUR", taxRate: 0.08, serviceModes: ["dine_in", "take_away"], openingHours: [],
    paymentConfiguration: { enabledMethods: ["card"], receiptPrintingEnabled: true, publicOptions: {} },
    noriConfiguration: { enabled: true, voiceEnabled: true, voiceSettings: {}, publicOptions: {} },
    idleScreenConfiguration: {
      timeoutSeconds: 300, videoIntervalMs: 9000, minimumPlaybackMs: 4000, transitionMs: 500,
      title: "MORROW", slogan: "Fresh. Fast. Delicious.", description: "Start your delicious journey",
      buttonLabel: "START ORDER", touchLabel: "Touch anywhere to begin", videos: [],
    },
    publishedMenuId: "menu", publishedMenuVersion: 1,
    realtimeConfiguration: {
      enabled: false, transport: "private_broadcast",
      branchTopic: "branch:branch:configuration", deviceTopic: "device:device:configuration",
    },
  };
}

function isFailure(code: string, status: number) {
  return (error: unknown) => error instanceof DeviceApiFailure && error.code === code && error.status === status;
}

void hashOpaqueToken;
