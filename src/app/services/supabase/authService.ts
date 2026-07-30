import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../../lib/supabase/client";
import type { ProfileRow } from "../../../lib/supabase/database.types";
import { MOCK_CREDENTIALS } from "../../auth/mockCredentials";
import type { StaffRole } from "../../auth/roleConfig";

export type StaffIdentity = { session: Session | null; profile: ProfileRow; isDemo: boolean };
export type AuthFailure = "invalid_credentials" | "inactive_profile" | "missing_profile" | "wrong_workspace" | "service_error";

export async function restoreStaffIdentity(): Promise<StaffIdentity | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  return error || !data.session ? null : loadIdentity(data.session);
}

export async function signInStaff(role: StaffRole, email: string, password: string): Promise<{ identity: StaffIdentity | null; error?: AuthFailure }> {
  if (!supabase) {
    const valid = MOCK_CREDENTIALS[role].email === email.trim().toLowerCase() && MOCK_CREDENTIALS[role].password === password;
    return valid ? { identity: { session: null, isDemo: true, profile: demoProfile(role) } } : { identity: null, error: "invalid_credentials" };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return { identity: null, error: error?.status === 400 ? "invalid_credentials" : "service_error" };
  const identity = await loadIdentity(data.session, true);
  if (!identity) { await supabase.auth.signOut(); return { identity: null, error: "missing_profile" }; }
  if (!identity.profile.is_active) { await supabase.auth.signOut(); return { identity: null, error: "inactive_profile" }; }
  if (identity.profile.role !== role) { await supabase.auth.signOut(); return { identity: null, error: "wrong_workspace" }; }
  return { identity };
}

export async function signOutStaff() { if (supabase) await supabase.auth.signOut(); }

export async function getStaffAccessToken() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}

export function onStaffAuthChange(callback: (identity: StaffIdentity | null) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) callback(null);
    else window.setTimeout(() => { void loadIdentity(session).then(callback); }, 0);
  });
  return () => data.subscription.unsubscribe();
}

async function loadIdentity(session: Session, includeInactive = false): Promise<StaffIdentity | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (error || !data || (!includeInactive && !data.is_active)) return null;
  return { session, profile: data, isDemo: false };
}

function demoProfile(role: StaffRole): ProfileRow {
  const now = new Date().toISOString();
  return { id: `demo-${role}`, full_name: `Morrow ${role}`, role, branch_id: "mock-main", is_active: true, created_at: now, updated_at: now };
}

export const authMode = isSupabaseConfigured ? "supabase" : "demo";
