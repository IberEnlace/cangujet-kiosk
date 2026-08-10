import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../../lib/supabase/client";
import type { ProfileRow } from "../../../lib/supabase/database.types";
import { MOCK_CREDENTIALS } from "../../auth/mockCredentials";
import type { StaffRole } from "../../auth/roleConfig";

export type StaffIdentity = { session: Session | null; profile: ProfileRow; isDemo: boolean };
export type AuthFailure = "invalid_credentials" | "inactive_profile" | "missing_profile" | "wrong_workspace" | "service_error";
export type StaffSessionVerification = "valid" | "unauthenticated" | "network_error";
export const STAFF_SESSION_INVALIDATED_EVENT = "morrow:staff-session-invalidated";
let staffRefreshPromise: Promise<{ token: string | null; failure: "unauthenticated" | "network" | null }> | null = null;

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

export async function verifyStaffSession(): Promise<StaffSessionVerification> {
  if (!supabase) return "unauthenticated";
  const session = await supabase.auth.getSession();
  if (session.error) return isAuthenticationFailure(session.error) ? "unauthenticated" : "network_error";
  if (!session.data.session?.access_token) return "unauthenticated";
  try {
    const user = await supabase.auth.getUser(session.data.session.access_token);
    if (!user.error && user.data.user) return "valid";
    return isAuthenticationFailure(user.error) ? "unauthenticated" : "network_error";
  } catch {
    return "network_error";
  }
}

export async function invalidateStaffSession() {
  if (supabase) {
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* The local auth state is still invalidated below. */ }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STAFF_SESSION_INVALIDATED_EVENT));
}

export function onStaffSessionInvalidated(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(STAFF_SESSION_INVALIDATED_EVENT, callback);
  return () => window.removeEventListener(STAFF_SESSION_INVALIDATED_EVENT, callback);
}

export async function getStaffSessionCredential(): Promise<{ token: string | null; failure: "unauthenticated" | "network" | null }> {
  if (!supabase) return { token: null, failure: "unauthenticated" };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { token: null, failure: isAuthenticationFailure(error) ? "unauthenticated" : "network" };
    return data.session?.access_token
      ? { token: data.session.access_token, failure: null }
      : { token: null, failure: "unauthenticated" };
  } catch {
    return { token: null, failure: "network" };
  }
}

export async function getStaffAccessToken() {
  return (await getStaffSessionCredential()).token;
}

export function refreshStaffSessionCredential(): Promise<{ token: string | null; failure: "unauthenticated" | "network" | null }> {
  if (staffRefreshPromise) return staffRefreshPromise;
  const current = performStaffSessionRefresh();
  staffRefreshPromise = current;
  void current.finally(() => {
    if (staffRefreshPromise === current) staffRefreshPromise = null;
  }).catch(() => undefined);
  return current;
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

async function performStaffSessionRefresh(): Promise<{ token: string | null; failure: "unauthenticated" | "network" | null }> {
  if (!supabase) return { token: null, failure: "unauthenticated" };
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      if (!isAuthenticationFailure(error)) return { token: null, failure: "network" };
      await invalidateStaffSession();
      return { token: null, failure: "unauthenticated" };
    }
    if (!data.session?.access_token) {
      await invalidateStaffSession();
      return { token: null, failure: "unauthenticated" };
    }
    return { token: data.session.access_token, failure: null };
  } catch {
    return { token: null, failure: "network" };
  }
}

function demoProfile(role: StaffRole): ProfileRow {
  const now = new Date().toISOString();
  return { id: `demo-${role}`, full_name: `cangujet ${role}`, role, branch_id: "mock-main", is_active: true, created_at: now, updated_at: now };
}

function isAuthenticationFailure(error: { status?: number; name?: string } | null) {
  return error?.status === 401 || error?.status === 403 || error?.name === "AuthSessionMissingError";
}

export const authMode = isSupabaseConfigured ? "supabase" : "demo";
