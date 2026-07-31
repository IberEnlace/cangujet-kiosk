import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) {
    console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, secret);

  const key = crypto.randomUUID();
  const fingerprint = createHash("sha256").update("test-payload").digest("hex");

  console.log("Calling create_production_order RPC with fresh key:", key);
  console.log("Fingerprint:", fingerprint);

  const res = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: "ead25343-99f0-4f74-99f9-c6f0d25a0b24",
    p_branch_id: "24bdb147-3d0e-4268-81ba-88a9020a32fe",
    p_device_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_actor_type: "device",
    p_actor_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_source: "kiosk",
    p_service_mode: "dine_in",
    p_language: "en",
    p_notes: null,
    p_idempotency_key: key,
    p_request_fingerprint: fingerprint,
    p_menu_id: "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac",
    p_menu_version: 1,
    p_quote: {
      subtotal: "10.00",
      taxTotal: "0.80",
      discountTotal: "0.00",
      total: "10.80",
      items: []
    }
  });

  console.log("RPC Error:", res.error);
  console.log("RPC Data:", JSON.stringify(res.data, null, 2));

  // Now call RPC AGAIN with SAME key and SAME fingerprint!
  console.log("\nCalling create_production_order RPC AGAIN with SAME key and SAME fingerprint:");
  const resDuplicate = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: "ead25343-99f0-4f74-99f9-c6f0d25a0b24",
    p_branch_id: "24bdb147-3d0e-4268-81ba-88a9020a32fe",
    p_device_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_actor_type: "device",
    p_actor_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_source: "kiosk",
    p_service_mode: "dine_in",
    p_language: "en",
    p_notes: null,
    p_idempotency_key: key,
    p_request_fingerprint: fingerprint,
    p_menu_id: "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac",
    p_menu_version: 1,
    p_quote: {
      subtotal: "10.00",
      taxTotal: "0.80",
      discountTotal: "0.00",
      total: "10.80",
      items: []
    }
  });
  console.log("Duplicate RPC Error:", resDuplicate.error);
  console.log("Duplicate RPC Data:", JSON.stringify(resDuplicate.data, null, 2));

  // Now call RPC AGAIN with SAME key but DIFFERENT fingerprint!
  console.log("\nCalling create_production_order RPC AGAIN with SAME key but DIFFERENT fingerprint:");
  const resConflict = await supabase.rpc("create_production_order" as any, {
    p_restaurant_id: "ead25343-99f0-4f74-99f9-c6f0d25a0b24",
    p_branch_id: "24bdb147-3d0e-4268-81ba-88a9020a32fe",
    p_device_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_actor_type: "device",
    p_actor_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    p_source: "kiosk",
    p_service_mode: "dine_in",
    p_language: "en",
    p_notes: null,
    p_idempotency_key: key,
    p_request_fingerprint: "1111111111111111111111111111111111111111111111111111111111111111",
    p_menu_id: "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac",
    p_menu_version: 1,
    p_quote: {
      subtotal: "10.00",
      taxTotal: "0.80",
      discountTotal: "0.00",
      total: "10.80",
      items: []
    }
  });
  console.log("Conflict RPC Error:", resConflict.error);
  console.log("Conflict RPC Data:", JSON.stringify(resConflict.data, null, 2));
}

main().catch(console.error);
