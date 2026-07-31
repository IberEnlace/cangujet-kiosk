import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  const branchId = "24bdb147-3d0e-4268-81ba-88a9020a32fe";
  const res = await supabase
    .from("menu_branches")
    .select("menu_id, is_active, menus(id, version, status)")
    .eq("branch_id", branchId);

  console.log("Menus for branch:", JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
