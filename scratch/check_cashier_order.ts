import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  // Query recent orders from cashier source or recent orders in general
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, source, restaurant_id, branch_id, device_id, status, payment_status, placed_at, completed_at, cancelled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("Error:", error);
  console.log("Recent orders:", JSON.stringify(orders, null, 2));

  // Query devices table for kitchen device context
  const { data: devices } = await supabase
    .from("devices")
    .select("id, name, restaurant_id, branch_id, type, status")
    .limit(10);

  console.log("Devices:", JSON.stringify(devices, null, 2));
}

main().catch(console.error);
