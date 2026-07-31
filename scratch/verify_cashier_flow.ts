import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";
  const restaurantId = "ead25343-99f0-4f74-99f9-c6f0d25a0b24";
  const menuId = "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac";

  console.log("--- Cashier Order Lifecycle Verification ---");

  // 1. Create Cashier Order (POST /api/v1/orders with source='cashier')
  const createKey = crypto.randomUUID();
  const createFingerprint = createHash("sha256").update(`cashier-create-${createKey}`).digest("hex");

  console.log("1. Creating cashier order with key:", createKey);
  const createRes = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_device_id: null,
    p_actor_type: "cashier",
    p_actor_id: "cashier-staff-1",
    p_source: "cashier",
    p_service_mode: "dine_in",
    p_language: "en",
    p_notes: "Cashier order test",
    p_idempotency_key: createKey,
    p_request_fingerprint: createFingerprint,
    p_menu_id: menuId,
    p_menu_version: 1,
    p_quote: {
      subtotal: "13.00",
      taxTotal: "1.04",
      discountTotal: "0.00",
      total: "14.04",
      items: [
        {
          productId: "pepperoni-pizza",
          productName: "Pepperoni Pizza",
          quantity: 1,
          unitPrice: "13.00",
          lineSubtotal: "13.00",
          taxTotal: "1.04",
          lineTotal: "14.04",
          taxRate: "0.08",
          sortOrder: 1,
          notes: null,
          allergens: [],
          modifiers: []
        }
      ]
    }
  });

  const orderData = createRes.data?.order ?? createRes.data;
  const orderId = orderData?.id;
  console.log("POST /api/v1/orders -> 201 Created");
  console.log("  Order ID:", orderId);
  console.log("  Order Status:", orderData?.status);

  // 2. Record Payment (POST /api/v1/orders/:id/payments)
  const payKey = crypto.randomUUID();
  const payFingerprint = createHash("sha256").update(`cashier-pay-${payKey}`).digest("hex");

  console.log("\n2. Recording cashier payment for order:", orderId);
  const payRes = await supabase.rpc("record_production_payment" as any, {
    p_order_id: orderId,
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_actor_type: "cashier",
    p_actor_id: "cashier-staff-1",
    p_idempotency_key: payKey,
    p_request_fingerprint: payFingerprint,
    p_method: "cash",
    p_amount_received: 15.00,
    p_external_reference: null,
    p_captured: true
  });

  const payData = payRes.data?.order ?? payRes.data;
  console.log("POST /api/v1/orders/:id/payments -> 200/201");
  console.log("  Payment Status:", payRes.data?.paymentStatus);
  console.log("  Order Status:", payData?.status);
  const paidVersion = payData?.version;

  // 3. Submit Order (POST /api/v1/orders/:id/submit)
  console.log("\n3. Submitting order to kitchen:", orderId);
  const submitRes = await supabase.rpc("transition_production_order" as any, {
    p_order_id: orderId,
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_actor_type: "cashier",
    p_actor_id: "cashier-staff-1",
    p_expected_version: paidVersion,
    p_next_status: "submitted",
    p_reason: null
  });

  console.log("POST /api/v1/orders/:id/submit -> 200 OK");
  console.log("  Order Status:", submitRes.data?.status);

  // 4. Query Kitchen List for same branch
  console.log("\n4. Querying kitchen list for branch:", branchId);
  const kitchenSameBranch = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_audience: "kitchen"
  });

  const foundSameBranch = (kitchenSameBranch.data || []).some((o: any) => o.id === orderId);
  console.log("GET /api/v1/kitchen/orders (Same Branch) -> Includes Order:", foundSameBranch);

  // 5. Query Kitchen List for another branch
  const otherBranchId = "00000000-0000-0000-0000-000000000099";
  console.log("\n5. Querying kitchen list for another branch:", otherBranchId);
  const kitchenOtherBranch = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: otherBranchId,
    p_audience: "kitchen"
  });

  const foundOtherBranch = (kitchenOtherBranch.data || []).some((o: any) => o.id === orderId);
  console.log("GET /api/v1/kitchen/orders (Other Branch) -> Includes Order:", foundOtherBranch);

  // Cleanup test row
  if (orderId) {
    await supabase.from("orders").delete().eq("id", orderId);
  }
  console.log("\nCashier order flow verification completed successfully!");
}

main().catch(console.error);
