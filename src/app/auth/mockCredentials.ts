import type { StaffRole } from "./roleConfig";

export const MOCK_CREDENTIALS: Record<StaffRole, { email: string; password: string }> = {
  admin: { email: "admin@morrow.local", password: "admin123" },
  cashier: { email: "cashier@morrow.local", password: "cashier123" },
  kitchen: { email: "kitchen@morrow.local", password: "kitchen123" },
};

export const DEVICE_MANAGER_PIN = "2468";
export const CUSTOMER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
