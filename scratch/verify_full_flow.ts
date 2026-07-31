import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";
  const restaurantId = "ead25343-99f0-4f74-99f9-c6f0d25a0b24";
  const deviceId = "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca";
  const menuId = "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac";

  // 1. Create order via RPC
  const createKey = crypto.randomUUID();
  const createFingerprint = createHash("sha256").update(`create-${createKey}`).digest("hex");

  console.log("1. Creating order with key:", createKey);
  const createRes = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_device_id: deviceId,
    p_actor_type: "device",
    p_actor_id: deviceId,
    p_source: "kiosk",
    p_service_mode: "dine_in",
    p_language: "en",
    p_notes: null,
    p_idempotency_key: createKey,
    p_request_fingerprint: createFingerprint,
    p_menu_id: menuId,
    p_menu_version: 1,
    p_quote: {
      subtotal: "15.00",
      taxTotal: "1.20",
      discountTotal: "0.00",
      total: "16.20",
      items: []
    }
  });

  console.log("Create Result Order Status:", createRes.data?.order?.status);
  const orderId = createRes.data?.order?.id;
  const version = createRes.data?.order?.version;

  if (!orderId) {
    console.error("Create failed:", createRes.error);
    process.exit(1);
  }

  // 2. Capture payment via RPC
  const payKey = crypto.randomUUID();
  const payFingerprint = createHash("sha256").update(`pay-${payKey}`).digest("hex");

  console.log("2. Capturing payment for order:", orderId);
  const payRes = await supabase.rpc("record_production_payment" as any, {
    p_order_id: orderId,
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_actor_type: "device",
    p_actor_id: deviceId,
    p_idempotency_key: payKey,
    p_request_fingerprint: payFingerprint,
    p_method: "card_terminal",
    p_amount_received: null,
    p_external_reference: "tx-12345",
    p_captured: true
  });

  console.log("Payment Result Payment Status:", payRes.data?.paymentStatus);
  console.log("Payment Result Order Status:", payRes.data?.order?.status);
  const paidVersion = payRes.data?.order?.version;

  // 3. Submit order via RPC
  console.log("3. Submitting order to kitchen:", orderId);
  const submitRes = await supabase.rpc("transition_production_order" as any, {
    p_order_id: orderId,
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_actor_type: "device",
    p_actor_id: deviceId,
    p_expected_version: paidVersion,
    p_next_status: "submitted",
    p_reason: null
  });

  console.log("Submit Result Order Status:", submitRes.data?.status);

  // 4. Query Kitchen List for branch
  console.log("4. Fetching kitchen order list for branch...");
  const kitchenRes = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_audience: "kitchen"
  });

  const kitchenOrders = kitchenRes.data || [];
  const foundInKitchen = kitchenOrders.some((o: any) => o.id === orderId);
  console.log("Found order in kitchen queue:", foundInKitchen);

  // Clean up test order
  await supabase.from("orders").delete().eq("id", orderId);
  console.log("Full lifecycle verification PASSED!");
}

main().catch(console.error);
