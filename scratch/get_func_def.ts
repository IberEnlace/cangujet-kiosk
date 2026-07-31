import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const supabase = createClient(url!, secret!);

  // Query tables in public schema
  const { data: tables, error: tableErr } = await supabase
    .from("orders")
    .select("id")
    .limit(1);

  console.log("Database connection OK:", !tableErr);
}

main().catch(console.error);
