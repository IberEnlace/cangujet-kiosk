import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const restaurantId = "ead25343-99f0-4f74-99f9-c6f0d25a0b24";
  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";

  const res = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_audience: "kitchen"
  });

  console.log("Orders returned by list_production_orders:");
  for (const o of (res.data || [])) {
    console.log(`Order ${o.orderNumber} (id: ${o.id}, source: ${o.source}, status: ${o.status}):`);
    console.log("  Items:", JSON.stringify(o.items, null, 2));
  }
}

main().catch(console.error);
