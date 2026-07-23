import { supabase } from "../../../lib/supabase/client";
import type { PublicBoardRow } from "../../../lib/supabase/database.types";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export async function fetchPublicOrderBoard(branchCode = import.meta.env?.VITE_MORROW_BRANCH_CODE?.trim() || "MAIN"): Promise<RepositoryResult<PublicBoardRow[]>> {
  if (!supabase) return repositoryFailure("configuration", "Live order board is not configured.");
  const { data, error } = await supabase.rpc("get_public_order_board", { p_branch_code: branchCode });
  if (error) return repositoryFailure("network", "The order board could not be loaded.", error);
  return { ok: true, data: data, source: "supabase" };
}
