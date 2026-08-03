export type UserRole = "customer" | "admin" | "cashier" | "kitchen" | "display";
export type StaffRole = Extract<UserRole, "admin" | "cashier" | "kitchen">;
export type DeviceMode = "unassigned" | UserRole;

export const ROUTES = {
  idle: "/idle",
  language: "/language",
  service: "/service",
  categories: "/categories",
  nori: "/nori",
  noriChat: "/nori/chat",
  noriVoice: "/nori/voice",
  selectRole: "/select-role",
  kiosk: "/kiosk",
  cart: "/cart",
  payment: "/payment",
  cardPayment: "/payment/card",
  qrPayment: "/payment/qr",
  mockQrPayment: "/mock-qr-payment",
  payAtCashierConfirmation: "/payment/pay-at-cashier/confirmation",
  orderConfirmation: "/order-confirmation",
  tracking: "/tracking",
  adminLogin: "/admin/login",
  admin: "/admin",
  adminDashboard: "/admin/dashboard",
  adminMenu: "/admin/menu",
  adminCategories: "/admin/categories",
  adminNotifications: "/admin/notifications",
  adminSettings: "/admin/settings",
  cashierLogin: "/cashier/login",
  cashier: "/cashier",
  kitchenLogin: "/kitchen/login",
  kitchen: "/kitchen",
  display: "/display",
  deviceSetup: "/device-setup",
  deviceInfo: "/device-info",
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
export const STAFF_ROLES: StaffRole[] = ["admin", "cashier", "kitchen"];
export const DEVICE_MODE_KEY = "morrow_device_mode";
export const AUTH_ROLE_KEY = "morrow_authenticated_role";
export const AUTH_FLAG_KEY = "morrow_is_authenticated";

export function isStaffRole(role: UserRole | null): role is StaffRole {
  return role !== null && STAFF_ROLES.includes(role as StaffRole);
}

export function getLoginRouteForRole(role: StaffRole): AppRoute {
  return ROUTES[`${role}Login` as "adminLogin" | "cashierLogin" | "kitchenLogin"];
}

export function getHomeRouteForRole(role: UserRole): AppRoute {
  const routes: Record<UserRole, AppRoute> = {
    customer: ROUTES.idle, admin: ROUTES.adminDashboard, cashier: ROUTES.cashier,
    kitchen: ROUTES.kitchen, display: ROUTES.display,
  };
  return routes[role];
}

export function isDeviceMode(value: string | null): value is DeviceMode {
  return ["unassigned", "customer", "admin", "cashier", "kitchen", "display"].includes(value ?? "");
}
