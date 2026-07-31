import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) {
    console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, secret);

  const key = "393e4c76-be00-482a-bb5b-adf7f4957115";
  console.log("Querying orders table for idempotency_key:", key);

  const res = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, branch_id, device_id, source, idempotency_key, request_fingerprint, created_at, status")
    .eq("idempotency_key", key);

  console.log("Query result error:", res.error);
  console.log("Query result data:", JSON.stringify(res.data, null, 2));

  // Also query recent 5 orders
  const recent = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, branch_id, device_id, source, idempotency_key, request_fingerprint, created_at, status")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\nRecent 5 orders:");
  console.log(JSON.stringify(recent.data, null, 2));
}

main().catch(console.error);
