import { ROUTES, type AppRoute, type StaffRole, type UserRole, getHomeRouteForRole, getLoginRouteForRole, isStaffRole } from "./roleConfig";

const CUSTOMER_ROUTES: AppRoute[] = [ROUTES.idle, ROUTES.language, ROUTES.service, ROUTES.categories, ROUTES.kiosk, ROUTES.cart, ROUTES.payment, ROUTES.tracking];
const LOGIN_ROLE: Partial<Record<AppRoute, StaffRole>> = {
  [ROUTES.adminLogin]: "admin", [ROUTES.cashierLogin]: "cashier", [ROUTES.kitchenLogin]: "kitchen",
};
const HOME_ROLE: Partial<Record<AppRoute, UserRole>> = {
  [ROUTES.admin]: "admin", [ROUTES.cashier]: "cashier", [ROUTES.kitchen]: "kitchen", [ROUTES.display]: "display",
};

export function isKnownRoute(route: string): route is AppRoute {
  return Object.values(ROUTES).includes(route as AppRoute);
}

export function guardRoute(route: AppRoute, role: UserRole | null, authenticated: boolean): AppRoute {
  const publicUtilityRoutes: AppRoute[] = [ROUTES.selectRole, ROUTES.deviceSetup, ROUTES.dev];
  if (publicUtilityRoutes.includes(route)) return route;
  if (CUSTOMER_ROUTES.includes(route)) return route;
  const loginRole = LOGIN_ROLE[route];
  if (loginRole) {
    if (authenticated && role) return getHomeRouteForRole(role);
    return route;
  }
  const required = HOME_ROLE[route];
  if (!required) return ROUTES.selectRole;
  if (required === "display") return route;
  if (!authenticated || !role) return getLoginRouteForRole(required as StaffRole);
  return role === required ? route : getHomeRouteForRole(role);
}

export function canRoleAccess(role: UserRole | null, route: AppRoute, authenticated: boolean): boolean {
  return guardRoute(route, role, authenticated) === route && (!isStaffRole(role) || authenticated || route.endsWith("/login"));
}
