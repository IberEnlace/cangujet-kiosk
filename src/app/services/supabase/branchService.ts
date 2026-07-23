import { supabase } from "../../../lib/supabase/client";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

export type BranchReference = { id: string; name: string; code: string; currency: string; timezone: string; taxRate: number };
let branchCache: { code: string; branch: BranchReference } | null = null;

export async function resolveBranch(code = import.meta.env?.VITE_MORROW_BRANCH_CODE?.trim() || "MAIN"): Promise<RepositoryResult<BranchReference>> {
  const cached = branchCache;
  if (cached && cached.code === code) return { ok: true, data: cached.branch, source: "supabase" };
  if (!supabase) return repositoryFailure("configuration", "Cloud ordering is not configured.");
  const { data, error } = await supabase.rpc("resolve_active_branch", { p_code: code });
  const row = data?.[0];
  if (error || !row) return repositoryFailure(error ? "network" : "not_found", "The restaurant branch is unavailable.", error);
  const branch = { id: row.id, name: row.name, code: row.code, currency: row.currency, timezone: row.timezone, taxRate: Number(row.tax_rate) };
  branchCache = { code, branch };
  return { ok: true, data: branch, source: "supabase" };
}

export function invalidateBranchCache() { branchCache = null; }
