export type OrderStatus = "completed" | "preparing" | "ready";
export type SystemStatus = "online" | "connected" | "not_connected" | "coming_soon" | "mock" | "enabled" | "disabled";

export interface DashboardStats { todaySales: number; todayOrders: number; kioskName: string; kioskNumber: string }
export interface RecentOrder { id: string; time: string; itemCount: number; total: number; status: OrderStatus }
export interface SystemStatusItem { label: string; status: SystemStatus }
export interface DeviceConfiguration { kioskId: string; kioskName: string; kioskNumber: string; branchId: string; branchName: string; connectionStatus: "connected" | "not_configured" | "error"; lastSync?: string; menuVersion?: string }
export interface AdminProduct { id: string; name: string; description: string; category: string; price: number; image: string; available: boolean; calories: number; protein: number; allergens: string[] }
export interface AdminCategory { id: string; name: string; description: string; icon: string; displayOrder: number; active: boolean }
export interface NotificationSettings { restaurantEmail: string; secondaryEmail: string; dailySalesReport: boolean; weeklySalesSummary: boolean; orderFailureAlerts: boolean; paymentFailureAlerts: boolean; kioskOfflineAlerts: boolean; kitchenDisplayOfflineAlerts: boolean; deviceSyncFailureAlerts: boolean; dailyReportTime: string }
