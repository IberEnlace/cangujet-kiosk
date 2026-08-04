import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, DeviceStatus, DeviceType } from "../../lib/supabase/database.types";
import type {
  CreateActivationKeyRequest,
  CreateActivationKeyResponse,
  DeviceManagementSnapshot,
  ManagedDevice,
  SafeActivationKey,
} from "../../shared/deviceManagement";
import { createDeviceActivationKey, hashDeviceActivationKey } from "./deviceActivationKeyService";
import { DeviceApiFailure } from "./deviceIdentityService";

const DEVICE_TYPES: DeviceType[] = ["kiosk", "cashier_terminal", "kitchen_display", "order_display", "admin_terminal"];

export class DeviceManagementService {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly pepper: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(staffToken: string): Promise<DeviceManagementSnapshot> {
    const scope = await this.authorize(staffToken);
    const restaurantIds = scope.map(item => item.restaurant_id);
    const [branches, keys, devices] = await Promise.all([
      this.client.from("branches").select("id,restaurant_id,name,code,is_active").in("restaurant_id", restaurantIds).order("name"),
      this.client.from("device_activation_keys")
        .select("id,restaurant_id,branch_id,device_type,device_name,key_hint,status,activation_policy,expires_at,max_activations,activation_count,created_at,revoked_at")
        .in("restaurant_id", restaurantIds).order("created_at", { ascending: false }),
      this.client.from("devices").select("*").in("restaurant_id", restaurantIds).order("created_at", { ascending: false }),
    ]);
    assertQuery(branches.error ?? keys.error ?? devices.error, "Device management data could not be loaded.");
    return {
      branches: (branches.data ?? []).map(branch => ({
        id: branch.id, restaurantId: branch.restaurant_id, name: branch.name, code: branch.code, active: branch.is_active,
      })),
      keys: (keys.data ?? []).map(key => mapKey(key, this.now())),
      devices: (devices.data ?? []).map(mapDevice),
    };
  }

  async createKey(staffToken: string, request: CreateActivationKeyRequest): Promise<CreateActivationKeyResponse> {
    const scope = await this.authorize(staffToken);
    if (!DEVICE_TYPES.includes(request.deviceType) || !request.deviceName?.trim() || request.deviceName.trim().length > 120) {
      throw invalidManagementRequest();
    }
    const maxActivations = request.activationPolicy === "one_time" ? 1 : Number(request.maxActivations);
    if (!Number.isInteger(maxActivations) || maxActivations < 1 || maxActivations > 1000) throw invalidManagementRequest();
    const expiresAt = request.expiresAt ? new Date(request.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= this.now())) throw invalidManagementRequest();
    const branch = await this.client.from("branches").select("id,restaurant_id,is_active")
      .eq("id", request.branchId).maybeSingle();
    assertQuery(branch.error, "Device branch could not be validated.");
    if (!branch.data?.is_active || !scope.some(item => item.restaurant_id === branch.data!.restaurant_id)) {
      throw new DeviceApiFailure("admin_forbidden", 403, "Administrator access is required.");
    }
    const generated = createDeviceActivationKey();
    const keyHash = hashDeviceActivationKey(generated.secretKey, this.pepper)!;
    const inserted = await this.client.from("device_activation_keys").insert({
      restaurant_id: branch.data.restaurant_id,
      branch_id: branch.data.id,
      device_type: request.deviceType,
      device_name: request.deviceName.trim(),
      key_hash: keyHash,
      key_hint: generated.keyHint,
      status: "active",
      activation_policy: request.activationPolicy,
      expires_at: expiresAt?.toISOString() ?? null,
      max_activations: maxActivations,
      activation_count: 0,
      created_by: scope[0].user_id,
      metadata: {},
    }).select("id,restaurant_id,branch_id,device_type,device_name,key_hint,status,activation_policy,expires_at,max_activations,activation_count,created_at,revoked_at").single();
    assertQuery(inserted.error, "Device activation key could not be created.");
    await this.client.from("device_audit_events").insert({
      device_id: null, credential_id: null, activation_key_id: inserted.data.id,
      event_type: "key_created", metadata: { key_hint: generated.keyHint },
    });
    return { key: mapKey(inserted.data, this.now()), secretKey: generated.secretKey };
  }

  async revokeKey(staffToken: string, keyId: string) {
    const key = await this.authorizeKey(staffToken, keyId);
    const now = this.now().toISOString();
    const updated = await this.client.from("device_activation_keys")
      .update({ status: "revoked", revoked_at: now }).eq("id", key.id).is("revoked_at", null);
    assertQuery(updated.error, "Device activation key could not be revoked.");
    await this.client.from("device_audit_events").insert({
      activation_key_id: key.id, event_type: "key_revoked", metadata: { key_hint: key.key_hint },
    });
  }

  async updateDevice(staffToken: string, deviceId: string, input: { name?: string; status?: DeviceStatus }) {
    const device = await this.authorizeDevice(staffToken, deviceId);
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 120) throw invalidManagementRequest();
      changes.name = name;
    }
    if (input.status !== undefined) {
      if (!(["active", "disabled", "revoked"] as DeviceStatus[]).includes(input.status)) throw invalidManagementRequest();
      changes.status = input.status;
      changes.revoked_at = input.status === "revoked" ? this.now().toISOString() : null;
    }
    if (!Object.keys(changes).length) throw invalidManagementRequest();
    const updated = await this.client.from("devices").update(changes).eq("id", device.id).select("*").single();
    assertQuery(updated.error, "Device could not be updated.");
    if (input.status === "disabled" || input.status === "revoked") await this.revokeAllSessions(device.id);
    await this.client.from("device_audit_events").insert({
      device_id: device.id, event_type: input.status === "active" ? "device_reactivated" : input.status ? "device_revoked" : "device_renamed",
      metadata: {},
    });
    return mapDevice(updated.data);
  }

  async revokeDeviceSessions(staffToken: string, deviceId: string) {
    const device = await this.authorizeDevice(staffToken, deviceId);
    await this.revokeAllSessions(device.id);
    await this.client.from("device_audit_events").insert({ device_id: device.id, event_type: "device_sessions_revoked", metadata: {} });
  }

  async refreshDeviceConfiguration(staffToken: string, deviceId: string) {
    const device = await this.authorizeDevice(staffToken, deviceId);
    const updated = await this.client.from("devices").update({ config_version: Number(device.config_version) + 1 })
      .eq("id", device.id).select("*").single();
    assertQuery(updated.error, "Device configuration version could not be refreshed.");
    return mapDevice(updated.data);
  }

  private async authorize(staffToken: string) {
    const user = await this.client.auth.getUser(staffToken);
    if (user.error || !user.data.user) throw new DeviceApiFailure("invalid_staff_session", 401, "A valid staff session is required.");
    const memberships = await this.client.from("staff_memberships").select("user_id,restaurant_id")
      .eq("user_id", user.data.user.id).eq("role", "admin").eq("is_active", true);
    assertQuery(memberships.error, "Administrator membership could not be verified.");
    if (!memberships.data?.length) throw new DeviceApiFailure("admin_forbidden", 403, "Administrator access is required.");
    return memberships.data;
  }

  private async authorizeKey(staffToken: string, keyId: string) {
    const scope = await this.authorize(staffToken);
    const key = await this.client.from("device_activation_keys").select("id,restaurant_id,key_hint").eq("id", keyId).maybeSingle();
    assertQuery(key.error, "Device activation key could not be found.");
    if (!key.data || !scope.some(item => item.restaurant_id === key.data!.restaurant_id)) throw new DeviceApiFailure("admin_forbidden", 403, "Administrator access is required.");
    return key.data;
  }

  private async authorizeDevice(staffToken: string, deviceId: string) {
    const scope = await this.authorize(staffToken);
    const device = await this.client.from("devices").select("*").eq("id", deviceId).maybeSingle();
    assertQuery(device.error, "Device could not be found.");
    if (!device.data || !scope.some(item => item.restaurant_id === device.data!.restaurant_id)) throw new DeviceApiFailure("admin_forbidden", 403, "Administrator access is required.");
    return device.data;
  }

  private async revokeAllSessions(deviceId: string) {
    const result = await this.client.from("device_sessions").update({ revoked_at: this.now().toISOString() })
      .eq("device_id", deviceId).is("revoked_at", null);
    assertQuery(result.error, "Device sessions could not be revoked.");
  }
}

export function createDeviceManagementServiceFromEnvironment() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const pepper = process.env.MORROW_DEVICE_KEY_PEPPER?.trim();
  if (!url || !secret || !pepper) throw new Error("Server-side device management configuration is missing.");
  return new DeviceManagementService(createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }), pepper);
}

function mapKey(key: any, now: Date): SafeActivationKey {
  const status = key.status === "active" && key.expires_at && Date.parse(key.expires_at) <= now.getTime() ? "expired" : key.status;
  return {
    id: key.id, restaurantId: key.restaurant_id, branchId: key.branch_id, deviceType: key.device_type,
    deviceName: key.device_name, keyHint: key.key_hint, status, activationPolicy: key.activation_policy,
    expiresAt: key.expires_at, maxActivations: key.max_activations, activationCount: key.activation_count,
    createdAt: key.created_at, revokedAt: key.revoked_at,
  };
}

function mapDevice(device: any): ManagedDevice {
  return {
    id: device.id, restaurantId: device.restaurant_id, branchId: device.branch_id,
    deviceType: device.device_type, name: device.name, status: device.status,
    configVersion: Number(device.config_version), lastSeenAt: device.last_seen_at,
    activatedAt: device.activated_at ?? null, revokedAt: device.revoked_at ?? null,
    appVersion: device.app_version ?? null, connectionHealth: device.connection_health ?? "unknown",
  };
}

function invalidManagementRequest() {
  return new DeviceApiFailure("invalid_device_management_request", 400, "The device management request is invalid.");
}

function assertQuery(error: { message: string } | null, message: string): asserts error is null {
  if (error) throw new Error(`${message} ${error.message}`);
}
