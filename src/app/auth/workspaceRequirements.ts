import { ROUTES, WORKSPACE_SELECTION_ROUTE, type AppRoute, type UserRole } from "./roleConfig";

const CUSTOMER_DEVICE_ROUTES: readonly AppRoute[] = [
  ROUTES.idle,
  ROUTES.language,
  ROUTES.service,
  ROUTES.categories,
  ROUTES.nori,
  ROUTES.noriChat,
  ROUTES.noriVoice,
  ROUTES.kiosk,
  ROUTES.cart,
  ROUTES.payment,
  ROUTES.cardPayment,
  ROUTES.qrPayment,
  ROUTES.payAtCashierConfirmation,
  ROUTES.orderConfirmation,
  ROUTES.tracking,
];
const DEVICE_ONLY_ROUTES: readonly AppRoute[] = [ROUTES.deviceSetup, ROUTES.deviceInfo, ROUTES.display];

export function routeRequiresDeviceSession(
  route: AppRoute,
  role: UserRole | null,
  staffAuthenticated: boolean,
) {
  if (CUSTOMER_DEVICE_ROUTES.includes(route)) return true;
  if (DEVICE_ONLY_ROUTES.includes(route)) return true;
  if (route === ROUTES.cashier) return !(staffAuthenticated && role === "cashier");
  if (route === ROUTES.kitchen) return !(staffAuthenticated && role === "kitchen");
  return false;
}

export function shouldInitializeDeviceSession(
  route: AppRoute,
  role: UserRole | null,
  staffAuthenticated: boolean,
) {
  // Cashier always restores device state first because an authoritative
  // cashier-terminal assignment takes precedence over any loaded staff profile.
  return route === WORKSPACE_SELECTION_ROUTE
    || route === ROUTES.cashier
    || routeRequiresDeviceSession(route, role, staffAuthenticated);
}
