import { isSupabaseConfigured, supabase } from "../../../lib/supabase/client";
import type { CreateOrderRow, Json } from "../../../lib/supabase/database.types";
import type { CartItem, OrderType } from "../../context/CartContext";
import { resolveBranch } from "./branchService";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export type CreatedOrder = CreateOrderRow;
export type CreateOrderItem = Pick<CartItem, "id" | "qty" | "price"> & {
  productId?: string;
  customizationOptionIds?: string[];
  noriCustomizations?: Array<{ optionId: string }>;
};
export type CreateOrderInput = {
  items: CreateOrderItem[];
  orderType: OrderType;
  customerNote?: string;
  idempotencyKey: string;
  source?: "kiosk" | "cashier" | "nori";
  branchId?: string;
};

export async function createOrder(input: CreateOrderInput): Promise<RepositoryResult<CreatedOrder>> {
  if (!input.items.length) return repositoryFailure("invalid_data", "Your cart is empty.");
  if (!isSupabaseConfigured || !supabase) return createDemoOrder(input);
  const configuredBranch = input.branchId
    ? { ok: true as const, data: { id: input.branchId } }
    : await resolveBranch();
  if (!configuredBranch.ok) return configuredBranch;
  const requestedItems = input.items.map(item => ({
    product_id: canonicalProductId(item),
    quantity: item.qty,
    customization_option_ids: item.customizationOptionIds
      ?? item.noriCustomizations?.map(customization => customization.optionId)
      ?? [],
  }));
  const resolvedItems = await resolveCustomizationOptionIds(requestedItems);
  if (!resolvedItems.ok) return resolvedItems;
  const { data, error } = await supabase.rpc("create_order", {
    p_branch_id: configuredBranch.data.id,
    p_source: input.source ?? "kiosk",
    p_order_type: input.orderType === "take_away" ? "takeaway" : "dine_in",
    p_items: resolvedItems.data as Json,
    p_customer_note: input.customerNote?.trim() || null,
    p_idempotency_key: input.idempotencyKey,
  });
  const order = data?.[0];
  if (error || !order) {
    if (import.meta.env?.DEV) console.error("[MORROW] Secure order creation failed.", error);
    return repositoryFailure(error?.code === "23505" ? "conflict" : "network", friendlyOrderError(error?.message), error);
  }
  return { ok: true, data: order, source: "supabase" };
}

function createDemoOrder(input: CreateOrderInput): RepositoryResult<CreatedOrder> {
  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = Math.round(subtotal * .08 * 100) / 100;
  const created = new Date().toISOString();
  return { ok: true, source: "local", data: { order_id: `demo-${input.idempotencyKey}`, order_number: `DEMO-${Date.now().toString().slice(-6)}`, subtotal, tax, total: subtotal + tax, currency: "EUR", order_status: "pending", payment_status: "unpaid", created_at: created } };
}

function canonicalProductId(item: CreateOrderItem) {
  const id = item.productId ?? item.id;
  return id.startsWith("menu-") ? id.slice(5) : id;
}

type RpcOrderItem = { product_id: string; quantity: number; customization_option_ids: string[] };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveCustomizationOptionIds(items: RpcOrderItem[]): Promise<RepositoryResult<RpcOrderItem[]>> {
  if (!supabase) return repositoryFailure("configuration", "Cloud ordering is not configured.");
  const sourceIds = [...new Set(items.flatMap(item => item.customization_option_ids).filter(id => !UUID_PATTERN.test(id)))];
  if (!sourceIds.length) return { ok: true, data: items, source: "supabase" };

  const productIds = [...new Set(items.filter(item => item.customization_option_ids.some(id => !UUID_PATTERN.test(id))).map(item => item.product_id))];
  const groups = await supabase.from("product_customization_groups").select("id,product_id").in("product_id", productIds);
  if (groups.error) return repositoryFailure("network", "Order customizations could not be resolved.", groups.error);
  const groupIds = groups.data.map(group => group.id);
  if (!groupIds.length) return repositoryFailure("invalid_data", "One of your item customizations is unavailable.");

  const options = await supabase.from("product_customization_options").select("id,group_id,source_id").in("group_id", groupIds).in("source_id", sourceIds);
  if (options.error) return repositoryFailure("network", "Order customizations could not be resolved.", options.error);
  const productByGroup = new Map(groups.data.map(group => [group.id, group.product_id]));
  const databaseIdBySource = new Map(options.data.map(option => [`${productByGroup.get(option.group_id)}:${option.source_id}`, option.id]));

  const resolved = items.map(item => ({
    ...item,
    customization_option_ids: item.customization_option_ids.map(id => UUID_PATTERN.test(id) ? id : databaseIdBySource.get(`${item.product_id}:${id}`) ?? ""),
  }));
  if (resolved.some(item => item.customization_option_ids.some(id => !id))) {
    return repositoryFailure("invalid_data", "One of your item customizations is unavailable.");
  }
  return { ok: true, data: resolved, source: "supabase" };
}
function friendlyOrderError(message?: string) {
  if (message?.includes("product_unavailable")) return "One of your items is no longer available. Please review your cart.";
  if (message?.includes("branch_unavailable")) return "This ordering location is temporarily unavailable.";
  if (message?.includes("currency_mismatch")) return "The menu currency does not match this register. Please contact an administrator.";
  if (message?.includes("customization")) return "One of your selections is no longer available. Please review the item.";
  return "We couldn’t create your order. Your cart is safe—please try again.";
}
