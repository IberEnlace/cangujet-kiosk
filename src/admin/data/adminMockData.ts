import menu from "../../app/data/morrow-menu-ai.json";
import type { AdminCategory, AdminProduct, DashboardStats, RecentOrder, SystemStatusItem } from "../types/adminTypes";

export const dashboardStats: DashboardStats = { todaySales: 1284.5, todayOrders: 132, kioskName: "Morrow Kiosk 01", kioskNumber: "KSK-001" };
export const recentOrders: RecentOrder[] = [
  { id: "#1847", time: "10:42", itemCount: 3, total: 32.4, status: "completed" }, { id: "#1846", time: "10:36", itemCount: 1, total: 10.5, status: "preparing" },
  { id: "#1845", time: "10:28", itemCount: 4, total: 47.2, status: "ready" }, { id: "#1844", time: "10:21", itemCount: 2, total: 18.9, status: "completed" },
  { id: "#1843", time: "10:12", itemCount: 3, total: 28.7, status: "preparing" },
];
export const systemStatuses: SystemStatusItem[] = [
  { label: "Kiosk App", status: "online" }, { label: "Internet", status: "connected" }, { label: "Kitchen Display", status: "connected" },
  { label: "Device Configuration", status: "not_connected" }, { label: "Payment Terminal", status: "coming_soon" }, { label: "Notifications", status: "enabled" },
];

type MenuProduct = { id: string; name: string; description?: string; category: string; price: number; image?: string; available?: boolean; allergens?: { contains?: string[] }; nutrition?: { calories?: number; proteinGrams?: number } };
// Admin editing is intentionally local-only; source product data is reused from the kiosk menu.
export const initialProducts: AdminProduct[] = (menu.products as MenuProduct[]).map(product => ({ id: product.id, name: product.name, description: product.description ?? "", category: product.category, price: product.price, image: product.image ?? "/images/products/burger.png", available: product.available !== false, calories: product.nutrition?.calories ?? 0, protein: product.nutrition?.proteinGrams ?? 0, allergens: product.allergens?.contains ?? [] }));
const categoryNames = ["Pizza", "Burgers", "Bowls", "Sides", "Drinks", "Desserts"];
export const initialCategories: AdminCategory[] = categoryNames.map((name, index) => ({ id: name.toLowerCase(), name, description: `${name} shown on the kiosk menu`, icon: "", displayOrder: index + 1, active: true }));
