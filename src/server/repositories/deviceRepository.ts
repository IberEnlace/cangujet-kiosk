import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BranchOpeningHoursRow,
  BranchRow,
  Database,
  DeviceCredentialRow,
  DeviceRow,
  DeviceSessionRow,
  IdleScreenConfigurationRow,
  LanguageRow,
  MenuRow,
  NoriConfigurationRow,
  PaymentConfigurationRow,
  RestaurantLanguageRow,
  RestaurantRow,
  ThemeRow,
  CategoryRow,
  ProductRow,
  CustomizationGroupRow,
  CustomizationOptionRow,
} from "../../lib/supabase/database.types";

export type DeviceCredentialIdentity = {
  credential: DeviceCredentialRow;
  device: DeviceRow;
};

export type DeviceSessionIdentity = {
  session: DeviceSessionRow;
  credential: DeviceCredentialRow;
  device: DeviceRow;
};

export type DeviceBootstrapData = {
  restaurant: RestaurantRow;
  branch: BranchRow;
  device: DeviceRow;
  theme: ThemeRow;
  languageAssignments: RestaurantLanguageRow[];
  languages: LanguageRow[];
  openingHours: BranchOpeningHoursRow[];
  payment: PaymentConfigurationRow;
  nori: NoriConfigurationRow;
  idle: IdleScreenConfigurationRow;
  menu: MenuRow;
};

export type NewDeviceSession = Pick<
  DeviceSessionRow,
  "id" | "device_id" | "credential_id" | "access_token_hash" | "refresh_token_hash" | "expires_at" | "refresh_expires_at"
>;

export type DeviceMenuData = {
  categories: CategoryRow[];
  products: ProductRow[];
  customizationGroups: CustomizationGroupRow[];
  customizationOptions: CustomizationOptionRow[];
};

export type DeviceMenuScope = {
  restaurantId: string;
  branchId: string;
  menuId: string;
};

export interface DeviceRepository {
  findCredential(publicKeyId: string): Promise<DeviceCredentialIdentity | null>;
  createSession(session: NewDeviceSession): Promise<void>;
  getSession(sessionId: string): Promise<DeviceSessionIdentity | null>;
  getSessionByRefreshHash(refreshHash: string): Promise<DeviceSessionIdentity | null>;
  updateSessionAccess(sessionId: string, accessTokenHash: string, expiresAt: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  touchDeviceSession(deviceId: string, sessionId: string): Promise<void>;
  recordRegistration(deviceId: string, credentialId: string): Promise<void>;
  recordAudit(deviceId: string | null, credentialId: string | null, eventType: string): Promise<void>;
  loadBootstrap(deviceId: string): Promise<DeviceBootstrapData | null>;
  loadMenuConfiguration(scope: DeviceMenuScope): Promise<DeviceMenuData | null>;
}

export class SupabaseDeviceRepository implements DeviceRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findCredential(publicKeyId: string): Promise<DeviceCredentialIdentity | null> {
    const credential = await this.client.from("device_credentials").select("*").eq("public_key_id", publicKeyId).maybeSingle();
    assertQuery(credential.error, "Device credential lookup failed.");
    if (!credential.data) return null;
    const device = await this.client.from("devices").select("*").eq("id", credential.data.device_id).maybeSingle();
    assertQuery(device.error, "Device lookup failed.");
    return device.data ? { credential: credential.data, device: device.data } : null;
  }

  async createSession(session: NewDeviceSession) {
    const result = await this.client.from("device_sessions").insert(session);
    assertQuery(result.error, "Device session could not be created.");
  }

  async getSession(sessionId: string): Promise<DeviceSessionIdentity | null> {
    const session = await this.client.from("device_sessions").select("*").eq("id", sessionId).maybeSingle();
    assertQuery(session.error, "Device session lookup failed.");
    return session.data ? this.resolveSessionIdentity(session.data) : null;
  }

  async getSessionByRefreshHash(refreshHash: string): Promise<DeviceSessionIdentity | null> {
    const session = await this.client.from("device_sessions").select("*").eq("refresh_token_hash", refreshHash).maybeSingle();
    assertQuery(session.error, "Device refresh session lookup failed.");
    return session.data ? this.resolveSessionIdentity(session.data) : null;
  }

  async updateSessionAccess(sessionId: string, accessTokenHash: string, expiresAt: string) {
    const result = await this.client.from("device_sessions")
      .update({ access_token_hash: accessTokenHash, expires_at: expiresAt, last_seen_at: new Date().toISOString() })
      .eq("id", sessionId);
    assertQuery(result.error, "Device access session could not be refreshed.");
  }

  async revokeSession(sessionId: string) {
    const result = await this.client.from("device_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("revoked_at", null);
    assertQuery(result.error, "Device session could not be revoked.");
  }

  async touchDeviceSession(deviceId: string, sessionId: string) {
    const now = new Date().toISOString();
    const [device, session] = await Promise.all([
      this.client.from("devices").update({ last_seen_at: now }).eq("id", deviceId),
      this.client.from("device_sessions").update({ last_seen_at: now }).eq("id", sessionId),
    ]);
    assertQuery(device.error ?? session.error, "Device activity could not be recorded.");
  }

  async recordRegistration(deviceId: string, credentialId: string) {
    const now = new Date().toISOString();
    const [credential, device, audit] = await Promise.all([
      this.client.from("device_credentials").update({ last_used_at: now }).eq("id", credentialId),
      this.client.from("devices").update({ last_seen_at: now }).eq("id", deviceId),
      this.client.from("device_audit_events").insert({
        device_id: deviceId,
        credential_id: credentialId,
        event_type: "device_registered",
        metadata: {},
      }),
    ]);
    assertQuery(credential.error ?? device.error ?? audit.error, "Device registration activity could not be recorded.");
  }

  async recordAudit(deviceId: string | null, credentialId: string | null, eventType: string) {
    const result = await this.client.from("device_audit_events").insert({
      device_id: deviceId,
      credential_id: credentialId,
      event_type: eventType,
      metadata: {},
    });
    assertQuery(result.error, "Device audit event could not be recorded.");
  }

  async loadBootstrap(deviceId: string): Promise<DeviceBootstrapData | null> {
    const deviceResult = await this.client.from("devices").select("*").eq("id", deviceId).maybeSingle();
    assertQuery(deviceResult.error, "Device bootstrap lookup failed.");
    const device = deviceResult.data;
    if (!device) return null;

    const [restaurant, branch, theme, languageAssignments, openingHours, payment, nori, idle, menuAssignment] = await Promise.all([
      this.client.from("restaurants").select("*").eq("id", device.restaurant_id).maybeSingle(),
      this.client.from("branches").select("*")
        .eq("id", device.branch_id).eq("restaurant_id", device.restaurant_id).maybeSingle(),
      this.client.from("themes").select("*").eq("restaurant_id", device.restaurant_id).eq("is_active", true).maybeSingle(),
      this.client.from("restaurant_languages").select("*").eq("restaurant_id", device.restaurant_id).order("display_order"),
      this.client.from("branch_opening_hours").select("*").eq("branch_id", device.branch_id).order("day_of_week").order("sequence"),
      this.client.from("payment_configurations").select("*").eq("branch_id", device.branch_id).maybeSingle(),
      this.client.from("nori_configurations").select("*").eq("branch_id", device.branch_id).maybeSingle(),
      this.client.from("idle_screen_configurations").select("*").eq("branch_id", device.branch_id).maybeSingle(),
      this.client.from("menu_branches").select("*")
        .eq("branch_id", device.branch_id).eq("is_active", true).maybeSingle(),
    ]);
    assertQuery(
      restaurant.error ?? branch.error ?? theme.error ?? languageAssignments.error ?? openingHours.error
        ?? payment.error ?? nori.error ?? idle.error ?? menuAssignment.error,
      "Device bootstrap configuration could not be loaded.",
    );
    if (!restaurant.data || !branch.data || !theme.data || !payment.data || !nori.data || !idle.data || !menuAssignment.data) return null;

    const savedLanguageAssignments = languageAssignments.data ?? [];
    const languageCodes = savedLanguageAssignments.map(value => value.language_code);
    const [languages, menu] = await Promise.all([
      languageCodes.length
        ? this.client.from("languages").select("*").in("code", languageCodes)
        : Promise.resolve({ data: [] as LanguageRow[], error: null }),
      this.client.from("menus").select("*")
        .eq("id", menuAssignment.data.menu_id)
        .eq("restaurant_id", device.restaurant_id)
        .eq("status", "published")
        .maybeSingle(),
    ]);
    assertQuery(languages.error ?? menu.error, "Device bootstrap menu or languages could not be loaded.");
    const savedLanguages = languages.data ?? [];
    if (!menu.data || savedLanguages.length !== languageCodes.length) return null;
    return {
      restaurant: restaurant.data,
      branch: branch.data,
      device,
      theme: theme.data,
      languageAssignments: savedLanguageAssignments,
      languages: savedLanguages,
      openingHours: openingHours.data ?? [],
      payment: payment.data,
      nori: nori.data,
      idle: idle.data,
      menu: menu.data,
    };
  }

  async loadMenuConfiguration(scope: DeviceMenuScope): Promise<DeviceMenuData | null> {
    const [assignment, menu] = await Promise.all([
      this.client.from("menu_branches").select("*")
        .eq("menu_id", scope.menuId)
        .eq("branch_id", scope.branchId)
        .eq("is_active", true)
        .maybeSingle(),
      this.client.from("menus").select("*")
        .eq("id", scope.menuId)
        .eq("restaurant_id", scope.restaurantId)
        .eq("status", "published")
        .maybeSingle(),
    ]);
    assertQuery(assignment.error ?? menu.error, "Device menu assignment could not be validated.");
    if (!assignment.data || !menu.data) return null;

    const categories = await this.client.from("categories")
      .select("*")
      .eq("menu_id", scope.menuId)
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("display_order")
      .order("name");
    assertQuery(categories.error, "Device menu categories could not be loaded.");
    const categoryIds = (categories.data ?? []).map(category => category.id);
    const products = categoryIds.length
      ? await this.client.from("products")
        .select("*")
        .in("category_id", categoryIds)
        .eq("is_active", true)
        .eq("is_available", true)
        .order("display_order")
        .order("name")
      : { data: [] as ProductRow[], error: null };
    assertQuery(products.error, "Device menu products could not be loaded.");
    const productIds = (products.data ?? []).map(product => product.id);
    const customizationGroups = productIds.length
      ? await this.client.from("product_customization_groups")
        .select("*")
        .in("product_id", productIds)
        .order("display_order")
      : { data: [] as CustomizationGroupRow[], error: null };
    assertQuery(customizationGroups.error, "Device menu modifier groups could not be loaded.");
    const groupIds = (customizationGroups.data ?? []).map(group => group.id);
    const customizationOptions = groupIds.length
      ? await this.client.from("product_customization_options")
        .select("*")
        .in("group_id", groupIds)
        .eq("is_available", true)
        .order("display_order")
      : { data: [] as CustomizationOptionRow[], error: null };
    assertQuery(customizationOptions.error, "Device menu modifier options could not be loaded.");
    return {
      categories: categories.data ?? [],
      products: products.data ?? [],
      customizationGroups: customizationGroups.data ?? [],
      customizationOptions: customizationOptions.data ?? [],
    };
  }

  private async resolveSessionIdentity(session: DeviceSessionRow): Promise<DeviceSessionIdentity | null> {
    const [credential, device] = await Promise.all([
      this.client.from("device_credentials").select("*").eq("id", session.credential_id).maybeSingle(),
      this.client.from("devices").select("*").eq("id", session.device_id).maybeSingle(),
    ]);
    assertQuery(credential.error ?? device.error, "Device session identity could not be loaded.");
    return credential.data && device.data ? { session, credential: credential.data, device: device.data } : null;
  }
}

export function createSupabaseDeviceRepositoryFromEnvironment() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("Server-side Supabase device configuration is missing.");
  const client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseDeviceRepository(client);
}

function assertQuery(error: { message: string } | null, message: string): asserts error is null {
  if (error) throw new Error(`${message} ${error.message}`);
}
