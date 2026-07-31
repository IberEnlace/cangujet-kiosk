import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const restaurantId = "ead25343-99f0-4f74-99f9-c6f0d25a0b24";
  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";

  console.log("Calling list_production_orders RPC for kitchen...");
  const res = await supabase.rpc("list_production_orders" as any, {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_audience: "kitchen"
  });

  console.log("RPC Error:", res.error);
  console.log("Returned Orders Count:", res.data?.length);
  console.log("Returned Orders:", JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
