import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  authMode, invalidateStaffSession, onStaffAuthChange, onStaffSessionInvalidated, restoreStaffIdentity,
  signInStaff, signOutStaff, verifyStaffSession as verifyPersistedStaffSession,
  type AuthFailure, type StaffIdentity, type StaffSessionVerification,
} from "../services/supabase/authService";
import { DEVICE_MODE_KEY, ROUTES, WORKSPACE_SELECTION_ROUTE, getHomeRouteForRole, isDeviceMode, isStaffRole, type AppRoute, type DeviceMode, type StaffRole, type UserRole } from "./roleConfig";
import { canRoleAccess } from "./routeGuards";

interface AuthContextValue {
  currentRole: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoAuth: boolean;
  sessionInvalidated: boolean;
  profile: StaffIdentity["profile"] | null;
  selectedDeviceMode: DeviceMode;
  login: (role: StaffRole, email: string, password: string) => Promise<{ ok: boolean; error?: AuthFailure }>;
  logout: (changeDeviceMode?: boolean) => Promise<void>;
  verifySession: (role: StaffRole) => Promise<StaffSessionVerification>;
  selectDeviceMode: (mode: DeviceMode, remember: boolean) => void;
  clearDeviceMode: () => void;
  canAccess: (route: AppRoute) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function restoreMode(): DeviceMode {
  const mode = localStorage.getItem(DEVICE_MODE_KEY);
  return isDeviceMode(mode) ? mode : "unassigned";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StaffIdentity["profile"] | null>(null);
  const [isDemoAuth, setDemoAuth] = useState(false);
  const [isLoading, setLoading] = useState(authMode === "supabase");
  const [sessionInvalidated, setSessionInvalidated] = useState(false);
  const [selectedDeviceMode, setSelectedDeviceMode] = useState<DeviceMode>(() => restoreMode());
  const currentRole = profile?.role ?? null;
  const isAuthenticated = profile !== null;

  const applyIdentity = useCallback((identity: StaffIdentity | null) => {
    setProfile(identity?.profile ?? null);
    setDemoAuth(identity?.isDemo ?? false);
    if (identity) setSessionInvalidated(false);
  }, []);

  useEffect(() => {
    let active = true;
    void restoreStaffIdentity().then(identity => { if (active) applyIdentity(identity); }).finally(() => { if (active) setLoading(false); });
    const unsubscribe = onStaffAuthChange(identity => { if (active) { applyIdentity(identity); setLoading(false); } });
    const unsubscribeInvalidation = onStaffSessionInvalidated(() => { if (active) { setProfile(null); setDemoAuth(false); setSessionInvalidated(true); setLoading(false); } });
    return () => { active = false; unsubscribe(); unsubscribeInvalidation(); };
  }, [applyIdentity]);

  const login = useCallback(async (role: StaffRole, email: string, password: string) => {
    const result = await signInStaff(role, email, password);
    applyIdentity(result.identity);
    if (result.identity) setSessionInvalidated(false);
    return { ok: Boolean(result.identity), error: result.error };
  }, [applyIdentity]);

  const verifySession = useCallback(async (role: StaffRole): Promise<StaffSessionVerification> => {
    if (isDemoAuth) return profile?.role === role && profile.is_active ? "valid" : "unauthenticated";
    const result = await verifyPersistedStaffSession();
    if (result === "valid") { setSessionInvalidated(false); return result; }
    if (result === "unauthenticated") {
      setProfile(null);
      setDemoAuth(false);
      setSessionInvalidated(true);
      await invalidateStaffSession();
    }
    return result;
  }, [isDemoAuth, profile]);

  const clearSession = useCallback(() => applyIdentity(null), [applyIdentity]);
  const clearDeviceMode = useCallback(() => { localStorage.removeItem(DEVICE_MODE_KEY); setSelectedDeviceMode("unassigned"); }, []);
  const logout = useCallback(async (changeDeviceMode = false) => {
    await signOutStaff();
    clearSession();
    if (changeDeviceMode) clearDeviceMode();
  }, [clearDeviceMode, clearSession]);

  const selectDeviceMode = useCallback((mode: DeviceMode, remember: boolean) => {
    setSelectedDeviceMode(mode);
    if (remember && mode !== "unassigned") localStorage.setItem(DEVICE_MODE_KEY, mode);
    else localStorage.removeItem(DEVICE_MODE_KEY);
    if (mode !== "unassigned" && isStaffRole(mode) && currentRole !== mode) clearSession();
    if (mode === "unassigned" || !isStaffRole(mode)) clearSession();
  }, [clearSession, currentRole]);

  const value = useMemo<AuthContextValue>(() => ({
    currentRole, isAuthenticated, isLoading, isDemoAuth, sessionInvalidated, profile, selectedDeviceMode, login, logout, verifySession, selectDeviceMode, clearDeviceMode,
    canAccess: route => canRoleAccess(currentRole, route, isAuthenticated),
  }), [currentRole, isAuthenticated, isLoading, isDemoAuth, sessionInvalidated, profile, selectedDeviceMode, login, logout, verifySession, selectDeviceMode, clearDeviceMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function getDefaultRouteForDevice(mode: DeviceMode, role: UserRole | null, authenticated: boolean): AppRoute {
  if (mode === "unassigned") return WORKSPACE_SELECTION_ROUTE;
  if (isStaffRole(mode)) return authenticated && role === mode ? getHomeRouteForRole(mode) : `/${mode}/login` as AppRoute;
  return mode === "customer" ? ROUTES.idle : getHomeRouteForRole(mode);
}
