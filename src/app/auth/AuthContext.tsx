import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MOCK_CREDENTIALS } from "./mockCredentials";
import { AUTH_FLAG_KEY, AUTH_ROLE_KEY, DEVICE_MODE_KEY, getHomeRouteForRole, isDeviceMode, isStaffRole, type AppRoute, type DeviceMode, type StaffRole, type UserRole } from "./roleConfig";
import { canRoleAccess } from "./routeGuards";

interface AuthContextValue {
  currentRole: UserRole | null;
  isAuthenticated: boolean;
  selectedDeviceMode: DeviceMode;
  login: (role: StaffRole, email: string, password: string) => Promise<boolean>;
  logout: (changeDeviceMode?: boolean) => void;
  selectDeviceMode: (mode: DeviceMode, remember: boolean) => void;
  clearDeviceMode: () => void;
  canAccess: (route: AppRoute) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function restoreRole(): StaffRole | null {
  const role = sessionStorage.getItem(AUTH_ROLE_KEY);
  return sessionStorage.getItem(AUTH_FLAG_KEY) === "true" && isStaffRole(role as UserRole) ? role as StaffRole : null;
}

function restoreMode(): DeviceMode {
  const mode = localStorage.getItem(DEVICE_MODE_KEY);
  return isDeviceMode(mode) ? mode : "unassigned";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<UserRole | null>(() => restoreRole());
  const [isAuthenticated, setAuthenticated] = useState(() => restoreRole() !== null);
  const [selectedDeviceMode, setSelectedDeviceMode] = useState<DeviceMode>(() => restoreMode());

  const login = useCallback(async (role: StaffRole, email: string, password: string) => {
    await new Promise(resolve => window.setTimeout(resolve, 450));
    const valid = MOCK_CREDENTIALS[role].email === email.trim().toLowerCase() && MOCK_CREDENTIALS[role].password === password;
    if (!valid) return false;
    setCurrentRole(role); setAuthenticated(true);
    sessionStorage.setItem(AUTH_ROLE_KEY, role);
    sessionStorage.setItem(AUTH_FLAG_KEY, "true");
    return true;
  }, []);

  const clearSession = useCallback(() => {
    setCurrentRole(null); setAuthenticated(false);
    sessionStorage.removeItem(AUTH_ROLE_KEY); sessionStorage.removeItem(AUTH_FLAG_KEY);
  }, []);

  const clearDeviceMode = useCallback(() => {
    localStorage.removeItem(DEVICE_MODE_KEY); setSelectedDeviceMode("unassigned");
  }, []);

  const logout = useCallback((changeDeviceMode = false) => {
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
    currentRole, isAuthenticated, selectedDeviceMode, login, logout, selectDeviceMode, clearDeviceMode,
    canAccess: route => canRoleAccess(currentRole, route, isAuthenticated),
  }), [currentRole, isAuthenticated, selectedDeviceMode, login, logout, selectDeviceMode, clearDeviceMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function getDefaultRouteForDevice(mode: DeviceMode, role: UserRole | null, authenticated: boolean): AppRoute {
  if (mode === "unassigned") return "/select-role";
  if (isStaffRole(mode)) return authenticated && role === mode ? getHomeRouteForRole(mode) : `/${mode}/login` as AppRoute;
  return getHomeRouteForRole(mode);
}
