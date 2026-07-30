import type { ProductionOrderStatus } from "../../../shared/orders";

export type KitchenAction = { label: string; nextStatus: ProductionOrderStatus };
export const NEXT_STATUS: Partial<Record<ProductionOrderStatus, ProductionOrderStatus>> = {
  submitted: "accepted", accepted: "preparing", preparing: "ready", ready: "completed",
};

export function getKitchenAction(status: ProductionOrderStatus): KitchenAction | null {
  switch (status) {
    case "submitted": return { label: "Accept Order", nextStatus: "accepted" };
    case "accepted": return { label: "Start Preparing", nextStatus: "preparing" };
    case "preparing": return { label: "Mark as Ready", nextStatus: "ready" };
    case "ready": return { label: "Complete Order", nextStatus: "completed" };
    default: return null;
  }
}
