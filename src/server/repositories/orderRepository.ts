import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type {
  OrderItemSnapshot,
  OrderPaymentResult,
  OrderQuote,
  OrderTracking,
  ProductionOrder,
  ProductionOrderSource,
  ProductionOrderStatus,
  ProductionPaymentMethod,
  ProductionServiceMode,
} from "../../shared/orders";

export type OrderActor = {
  actorType: "device" | "staff";
  actorId: string;
  restaurantId: string;
  branchId: string;
  deviceId: string | null;
  role: "device" | "cashier" | "kitchen" | "admin";
  deviceType: "kiosk" | "cashier_terminal" | "kitchen_display" | "order_display" | "admin_terminal" | null;
};

export type PricingProduct = {
  id: string;
  name: string;
  price: string;
  currency: string;
  active: boolean;
  available: boolean;
  categoryActive: boolean;
  categoryVisible: boolean;
  allergens: string[];
};

export type PricingModifierGroup = {
  id: string;
  productId: string;
  name: string;
  minimumSelections: number;
  maximumSelections: number;
  required: boolean;
};

export type PricingModifier = {
  id: string;
  groupId: string;
  name: string;
  price: string;
  available: boolean;
};

export type OrderPricingContext = {
  restaurantId: string;
  branchId: string;
  menuId: string;
  menuVersion: number;
  currency: string;
  timezone: string;
  taxRate: string;
  serviceModes: ProductionServiceMode[];
  products: PricingProduct[];
  modifierGroups: PricingModifierGroup[];
  modifiers: PricingModifier[];
};

export type PersistOrderInput = {
  actor: OrderActor;
  source: ProductionOrderSource;
  idempotencyKey: string;
  requestFingerprint: string;
  notes: string | null;
  quote: OrderQuote;
};

export type PersistPaymentInput = {
  actor: OrderActor;
  order: ProductionOrder;
  idempotencyKey: string;
  requestFingerprint: string;
  method: ProductionPaymentMethod;
  amountReceived: string | null;
  externalReference: string | null;
  captured: boolean;
};

export interface OrderRepository {
  authenticateStaff(accessToken: string): Promise<OrderActor | null>;
  loadPricingContext(actor: OrderActor): Promise<OrderPricingContext | null>;
  createOrder(input: PersistOrderInput): Promise<{ order: ProductionOrder; duplicate: boolean }>;
  getOrder(actor: OrderActor, orderId: string): Promise<ProductionOrder | null>;
  getTracking(customerReference: string): Promise<OrderTracking | null>;
  listActiveOrders(actor: OrderActor, audience: "kitchen" | "cashier" | "display"): Promise<ProductionOrder[]>;
  recordPayment(input: PersistPaymentInput): Promise<OrderPaymentResult & { duplicate: boolean }>;
  transitionOrder(input: {
    actor: OrderActor;
    orderId: string;
    expectedVersion: number;
    nextStatus: ProductionOrderStatus;
    reason: string | null;
  }): Promise<ProductionOrder>;
}

type RpcRow = Record<string, unknown>;
type SupabaseError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  constraint?: string;
  table?: string;
  column?: string;
  function?: string;
};

export class OrderRepositoryOperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly query: string,
    public readonly rpcName: string | null,
    public readonly supabaseError: SupabaseError,
    fallback: string,
  ) {
    super(supabaseError.message || fallback);
    this.name = "OrderRepositoryOperationError";
  }
}

export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async authenticateStaff(accessToken: string): Promise<OrderActor | null> {
    const user = await this.client.auth.getUser(accessToken);
    if (user.error || !user.data.user) return null;
    const userId = user.data.user.id;
    const membership = await this.client.from("staff_memberships").select("*")
      .eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (membership.error || !membership.data) return null;
    const profile = await this.client.from("profiles").select("*")
      .eq("id", userId).eq("is_active", true).maybeSingle();
    if (profile.error || !profile.data) return null;
    const branchId = profile.data.branch_id ?? membership.data.branch_id;
    if (!branchId && profile.data.role !== "admin") return null;
    return {
      actorType: "staff",
      actorId: userId,
      restaurantId: membership.data.restaurant_id,
      branchId: branchId ?? "",
      deviceId: null,
      role: profile.data.role,
      deviceType: null,
    };
  }

  async loadPricingContext(actor: OrderActor): Promise<OrderPricingContext | null> {
    const branch = await this.client.from("branches").select("*")
      .eq("id", actor.branchId).eq("restaurant_id", actor.restaurantId).eq("is_active", true).maybeSingle();
    if (branch.error) throw queryFailure("loadPricingContext.branch", "branches.select", branch.error);
    if (!branch.data) return null;
    const assignment = await this.client.from("menu_branches").select("*")
      .eq("branch_id", actor.branchId).eq("is_active", true).maybeSingle();
    if (assignment.error) throw queryFailure("loadPricingContext.assignment", "menu_branches.select", assignment.error);
    if (!assignment.data) return null;
    const menu = await this.client.from("menus").select("*")
      .eq("id", assignment.data.menu_id).eq("restaurant_id", actor.restaurantId).eq("status", "published").maybeSingle();
    if (menu.error) throw queryFailure("loadPricingContext.menu", "menus.select", menu.error);
    if (!menu.data) return null;
    const categories = await this.client.from("categories").select("*").eq("menu_id", menu.data.id);
    if (categories.error) throw queryFailure("loadPricingContext.categories", "categories.select", categories.error);
    const categoryIds = categories.data.map(value => value.id);
    const products = categoryIds.length
      ? await this.client.from("products").select("*").in("category_id", categoryIds)
      : { data: [], error: null };
    if (products.error) throw queryFailure("loadPricingContext.products", "products.select", products.error);
    const productIds = products.data.map(value => value.id);
    const groups = productIds.length
      ? await this.client.from("product_customization_groups").select("*").in("product_id", productIds)
      : { data: [], error: null };
    if (groups.error) throw queryFailure("loadPricingContext.modifierGroups", "product_customization_groups.select", groups.error);
    const groupIds = groups.data.map(value => value.id);
    const modifiers = groupIds.length
      ? await this.client.from("product_customization_options").select("*").in("group_id", groupIds)
      : { data: [], error: null };
    if (modifiers.error) throw queryFailure("loadPricingContext.modifiers", "product_customization_options.select", modifiers.error);
    const categoryById = new Map(categories.data.map(value => [value.id, value]));
    return {
      restaurantId: actor.restaurantId,
      branchId: actor.branchId,
      menuId: menu.data.id,
      menuVersion: menu.data.version,
      currency: branch.data.currency,
      timezone: branch.data.timezone,
      taxRate: String(branch.data.tax_rate),
      serviceModes: branch.data.service_modes.filter(isServiceMode),
      products: products.data.map(value => ({
        id: value.id,
        name: value.name,
        price: String(value.price),
        currency: value.currency,
        active: value.is_active,
        available: value.is_available,
        categoryActive: categoryById.get(value.category_id)?.is_active ?? false,
        categoryVisible: categoryById.get(value.category_id)?.is_visible ?? false,
        allergens: Array.isArray(value.allergens) ? value.allergens : [],
      })),
      modifierGroups: groups.data.map(value => ({
        id: value.id,
        productId: value.product_id,
        name: value.name,
        minimumSelections: value.minimum_selections,
        maximumSelections: value.maximum_selections,
        required: value.required,
      })),
      modifiers: modifiers.data.map(value => ({
        id: value.id,
        groupId: value.group_id,
        name: value.name,
        price: String(value.price_delta),
        available: value.is_available,
      })),
    };
  }

  async createOrder(input: PersistOrderInput) {
    const result = await (this.client as any).rpc("create_production_order", {
      p_restaurant_id: input.actor.restaurantId,
      p_branch_id: input.actor.branchId,
      p_device_id: input.actor.deviceId,
      p_actor_type: persistenceActorType(input.actor),
      p_actor_id: input.actor.actorId,
      p_source: input.source,
      p_service_mode: input.quote.serviceMode,
      p_language: input.quote.language,
      p_notes: input.notes,
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_menu_id: input.quote.menuId,
      p_menu_version: input.quote.menuVersion,
      p_quote: input.quote,
    });
    return parseRpcEnvelope(result, "Order could not be created.", "create_production_order");
  }

  async getOrder(actor: OrderActor, orderId: string) {
    const result = await (this.client as any).rpc("get_production_order", {
      p_order_id: orderId,
      p_restaurant_id: actor.restaurantId,
      p_branch_id: actor.branchId || null,
    });
    return parseNullableOrder(result, "Order could not be loaded.", "get_production_order");
  }

  async getTracking(customerReference: string) {
    const result = await (this.client as any).rpc("get_production_order_tracking", {
      p_customer_reference: customerReference,
    });
    const value = firstRpcValue(result, "Order tracking could not be loaded.", "get_production_order_tracking");
    return value ? value as OrderTracking : null;
  }

  async listActiveOrders(actor: OrderActor, audience: "kitchen" | "cashier" | "display") {
    const result = await (this.client as any).rpc("list_production_orders", {
      p_restaurant_id: actor.restaurantId,
      p_branch_id: actor.branchId || null,
      p_audience: audience,
    });
    const value = firstRpcValue(result, "Orders could not be loaded.", "list_production_orders");
    return Array.isArray(value) ? value as ProductionOrder[] : [];
  }

  async recordPayment(input: PersistPaymentInput) {
    const result = await (this.client as any).rpc("record_production_payment", {
      p_order_id: input.order.id,
      p_restaurant_id: input.actor.restaurantId,
      p_branch_id: input.actor.branchId,
      p_actor_type: persistenceActorType(input.actor),
      p_actor_id: input.actor.actorId,
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_method: input.method,
      p_amount_received: input.amountReceived,
      p_external_reference: input.externalReference,
      p_captured: input.captured,
    });
    return parseRpcEnvelope(result, "Payment could not be recorded.", "record_production_payment");
  }

  async transitionOrder(input: {
    actor: OrderActor;
    orderId: string;
    expectedVersion: number;
    nextStatus: ProductionOrderStatus;
    reason: string | null;
  }) {
    const result = await (this.client as any).rpc("transition_production_order", {
      p_order_id: input.orderId,
      p_restaurant_id: input.actor.restaurantId,
      p_branch_id: input.actor.branchId || null,
      p_actor_type: persistenceActorType(input.actor),
      p_actor_id: input.actor.actorId,
      p_expected_version: input.expectedVersion,
      p_next_status: input.nextStatus,
      p_reason: input.reason,
    });
    const value = firstRpcValue(result, "Order status could not be updated.", "transition_production_order");
    if (!value) throw new Error("order_not_found");
    return value as ProductionOrder;
  }
}

export function createSupabaseOrderRepositoryFromEnvironment() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("Server-side Supabase order configuration is missing.");
  return new SupabaseOrderRepository(createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

function firstRpcValue(
  result: { data: unknown; error: SupabaseError | null },
  fallback: string,
  rpcName: string,
): unknown {
  if (result.error) throw rpcFailure(rpcName, result.error, fallback);
  if (Array.isArray(result.data)) {
    const row = result.data[0] as RpcRow | undefined;
    return row && "result" in row ? row.result : row ?? null;
  }
  return result.data;
}

function parseRpcEnvelope(
  result: { data: unknown; error: SupabaseError | null },
  fallback: string,
  rpcName: string,
): any {
  const value = firstRpcValue(result, fallback, rpcName);
  if (!value || typeof value !== "object") throw new Error(fallback);
  return value;
}

function parseNullableOrder(
  result: { data: unknown; error: SupabaseError | null },
  fallback: string,
  rpcName: string,
) {
  const value = firstRpcValue(result, fallback, rpcName);
  return value ? value as ProductionOrder : null;
}

function queryFailure(operation: string, query: string, error: SupabaseError) {
  return new OrderRepositoryOperationError(operation, query, null, error, "Database query failed.");
}

function rpcFailure(rpcName: string, error: SupabaseError, fallback: string) {
  return new OrderRepositoryOperationError(
    `rpc.${rpcName}`,
    `supabase.rpc("${rpcName}", { ... })`,
    rpcName,
    error,
    fallback,
  );
}

function isServiceMode(value: string): value is ProductionServiceMode {
  return value === "dine_in" || value === "take_away";
}

function persistenceActorType(actor: OrderActor) {
  return actor.role === "device" ? "device" : actor.role;
}

export type { OrderItemSnapshot };
