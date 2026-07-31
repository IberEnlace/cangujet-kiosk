import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  // Query order_counters table
  const counters = await supabase.from("order_counters").select("*");
  console.log("Order counters:", JSON.stringify(counters.data, null, 2));

  // Query recent customer_references
  const refs = await supabase.from("orders").select("customer_reference, order_number, idempotency_key").limit(10);
  console.log("Recent orders:", JSON.stringify(refs.data, null, 2));
}

main().catch(console.error);
