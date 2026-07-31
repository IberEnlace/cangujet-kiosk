import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  await supabase.from("orders").delete().eq("id", "1161f83c-4548-4d78-860b-7fe0e55e7757");
  console.log("Cleanup complete");
}

main().catch(console.error);
