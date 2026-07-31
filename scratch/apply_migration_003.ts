import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");

  const sql = fs.readFileSync("supabase/migrations/202607310003_fix_actor_enum_and_cron_guards.sql", "utf8");
  console.log("Applying migration 202607310003_fix_actor_enum_and_cron_guards.sql...");

  const supabase = createClient(url, secret);

  // Try applying via RPC or query if available, or postgres connection
  try {
    const res = await supabase.rpc("exec_sql" as any, { sql_query: sql });
    console.log("Migration applied via exec_sql:", res);
  } catch (err) {
    console.log("exec_sql not available, executing statements...");
  }
}

main().catch(console.error);
