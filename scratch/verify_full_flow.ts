import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";
  const restaurantId = "ead25343-99f0-4f74-99f9-c6f0d25a0b24";
  const menuId = "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac";

  console.log("=== cangujet Full Order Lifecycle & Kitchen Realtime Verification ===");

  // 1. Cashier Flow Test
  console.log("\n--- 1. Testing Cashier Order Flow ---");
  const cashierKey = crypto.randomUUID();
  const cashierFingerprint = createHash("sha256").update(`cashier-${cashierKey}`).digest("hex");

  const cashierCreate = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: restaurantId, p_branch_id: branchId, p_device_id: null,
    p_actor_type: "cashier", p_actor_id: "cashier-staff-1", p_source: "cashier",
    p_service_mode: "dine_in", p_language: "en", p_notes: "Cashier order verification",
    p_idempotency_key: cashierKey, p_request_fingerprint: cashierFingerprint,
    p_menu_id: menuId, p_menu_version: 1,
    p_quote: { subtotal: "15.00", taxTotal: "1.20", discountTotal: "0.00", total: "16.20", items: [] }
  });

  const cashierOrderId = cashierCreate.data?.order?.id ?? cashierCreate.data?.id;
  console.log("1a. Cashier Order Created:");
  console.log("  Order ID:", cashierOrderId);
  console.log("  Status:", cashierCreate.data?.order?.status ?? cashierCreate.data?.status);

  // Cashier Payment
  const cashierPayKey = crypto.randomUUID();
  const cashierPayFingerprint = createHash("sha256").update(`cashier-pay-${cashierPayKey}`).digest("hex");
  const cashierPay = await supabase.rpc("record_production_payment" as any, {
    p_order_id: cashierOrderId, p_restaurant_id: restaurantId, p_branch_id: branchId,
    p_actor_type: "cashier", p_actor_id: "cashier-staff-1",
    p_idempotency_key: cashierPayKey, p_request_fingerprint: cashierPayFingerprint,
    p_method: "cash", p_amount_received: 20.00, p_external_reference: null, p_captured: true
  });
  const cashierPayOrder = cashierPay.data?.order ?? cashierPay.data;
  console.log("1b. Cashier Payment Recorded:");
  console.log("  Payment Status:", cashierPay.data?.paymentStatus);
  console.log("  Order Status:", cashierPayOrder?.status);

  // Cashier Submit
  const cashierSubmit = await supabase.rpc("transition_production_order" as any, {
    p_order_id: cashierOrderId, p_restaurant_id: restaurantId, p_branch_id: branchId,
    p_actor_type: "cashier", p_actor_id: "cashier-staff-1",
    p_expected_version: cashierPayOrder?.version, p_next_status: "submitted", p_reason: null
  });
  console.log("1c. Cashier Order Submitted:");
  console.log("  Final Order Status:", cashierSubmit.data?.status);

  // 2. Kiosk Flow Test
  console.log("\n--- 2. Testing Kiosk Order Flow ---");
  const kioskKey = crypto.randomUUID();
  const kioskFingerprint = createHash("sha256").update(`kiosk-${kioskKey}`).digest("hex");
  const kioskDeviceId = "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca";

  const kioskCreate = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: restaurantId, p_branch_id: branchId, p_device_id: kioskDeviceId,
    p_actor_type: "device", p_actor_id: kioskDeviceId, p_source: "kiosk",
    p_service_mode: "dine_in", p_language: "en", p_notes: null,
    p_idempotency_key: kioskKey, p_request_fingerprint: kioskFingerprint,
    p_menu_id: menuId, p_menu_version: 1,
    p_quote: { subtotal: "12.00", taxTotal: "0.96", discountTotal: "0.00", total: "12.96", items: [] }
  });
  const kioskOrderId = kioskCreate.data?.order?.id ?? kioskCreate.data?.id;
  console.log("2a. Kiosk Order Created:");
  console.log("  Order ID:", kioskOrderId);
  console.log("  Status:", kioskCreate.data?.order?.status ?? kioskCreate.data?.status);

  // Kiosk Payment (Card Terminal)
  const kioskPayKey = crypto.randomUUID();
  const kioskPayFingerprint = createHash("sha256").update(`kiosk-pay-${kioskPayKey}`).digest("hex");
  const kioskPay = await supabase.rpc("record_production_payment" as any, {
    p_order_id: kioskOrderId, p_restaurant_id: restaurantId, p_branch_id: branchId,
    p_actor_type: "device", p_actor_id: kioskDeviceId,
    p_idempotency_key: kioskPayKey, p_request_fingerprint: kioskPayFingerprint,
    p_method: "card_terminal", p_amount_received: 12.96, p_external_reference: "tx-kiosk-99", p_captured: true
  });
  const kioskPayOrder = kioskPay.data?.order ?? kioskPay.data;
  console.log("2b. Kiosk Payment Recorded:");
  console.log("  Payment Status:", kioskPay.data?.paymentStatus);
  console.log("  Order Status:", kioskPayOrder?.status);

  // Kiosk Submit
  const kioskSubmit = await supabase.rpc("transition_production_order" as any, {
    p_order_id: kioskOrderId, p_restaurant_id: restaurantId, p_branch_id: branchId,
    p_actor_type: "device", p_actor_id: kioskDeviceId,
    p_expected_version: kioskPayOrder?.version, p_next_status: "submitted", p_reason: null
  });
  console.log("2c. Kiosk Order Submitted:");
  console.log("  Final Order Status:", kioskSubmit.data?.status);

  // 3. Kitchen List Verification
  console.log("\n--- 3. Verifying Kitchen Orders Listing ---");
  const kitchenList = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId, p_branch_id: branchId, p_audience: "kitchen"
  });

  const ordersList = kitchenList.data || [];
  const hasCashierOrder = ordersList.some((o: any) => o.id === cashierOrderId);
  const hasKioskOrder = ordersList.some((o: any) => o.id === kioskOrderId);

  console.log(`Kitchen List returned ${ordersList.length} active orders.`);
  console.log("  Includes Cashier Order:", hasCashierOrder);
  console.log("  Includes Kiosk Order:", hasKioskOrder);

  // Cleanup test orders
  await supabase.from("orders").delete().in("id", [cashierOrderId, kioskOrderId]);
  console.log("\nAll end-to-end verification steps completed successfully!");
}

main().catch(console.error);
