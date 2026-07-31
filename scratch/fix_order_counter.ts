import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";
  const businessDate = "2026-07-31";

  // Check highest order number for this branch and date
  const { data: orders } = await supabase
    .from("orders")
    .select("order_number")
    .eq("branch_id", branchId);

  console.log("Existing order numbers for branch:", orders?.map(o => o.order_number));

  // Update order_counters for today to be at least 10 (M110) so it never collides with M101/M102!
  const { data: counter, error: counterErr } = await supabase
    .from("order_counters")
    .upsert({ branch_id: branchId, business_date: businessDate, current_value: 10 })
    .select("*");

  console.log("Updated order_counters:", counterErr, counter);
}

main().catch(console.error);
