import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const key = crypto.randomUUID();
  console.log("Directly inserting order with key:", key);

  const insertRes = await supabase.from("orders").insert({
    restaurant_id: "ead25343-99f0-4f74-99f9-c6f0d25a0b24",
    branch_id: "24bdb147-3d0e-4268-81ba-88a9020a32fe",
    device_id: "3f11ad05-8f86-4aa6-ba5e-a4637c7b02ca",
    source: "kiosk",
    order_number: "TEST-999",
    status: "awaiting_payment",
    service_mode: "dine_in",
    currency: "EUR",
    subtotal: 10.00,
    tax_total: 0.80,
    discount_total: 0.00,
    total: 10.80,
    language: "en",
    customer_reference: "ref-" + key.slice(0, 8),
    business_date: "2026-07-31",
    idempotency_key: key,
    request_fingerprint: "6f06dd0e26608013eff30bb1e951cda7de3fdd9e78e907470e0dd5c0ed25e273",
    menu_id: "941aadc1-3dc6-422f-9f3b-ea544fe4d9ac",
    menu_version: 1
  }).select("*");

  console.log("Insert Error:", insertRes.error);
  console.log("Insert Data:", JSON.stringify(insertRes.data, null, 2));

  if (insertRes.data?.[0]?.id) {
    // Cleanup test row
    await supabase.from("orders").delete().eq("id", insertRes.data[0].id);
  }
}

main().catch(console.error);
