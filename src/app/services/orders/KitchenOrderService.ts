import type { ProductionOrder, ProductionOrderStatus } from "../../../shared/orders";
import { orderService } from "./OrderService";

export const COMPLETED_KITCHEN_VISIBILITY_MS = 5 * 60_000;

const NEXT_KITCHEN_STATUS: Partial<Record<ProductionOrderStatus, ProductionOrderStatus>> = {
  submitted: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "completed",
};

export class KitchenOrderService {
  list() {
    return orderService.listKitchen();
  }

  next(order: ProductionOrder) {
    const nextStatus = NEXT_KITCHEN_STATUS[order.status];
    if (!nextStatus) return Promise.resolve(order);
    return this.setStatus(order, nextStatus);
  }

  setStatus(order: ProductionOrder, nextStatus: ProductionOrderStatus, reason?: string) {
    return orderService.transition(order.id, { nextStatus, expectedVersion: order.version, reason });
  }
}

export const kitchenOrderService = new KitchenOrderService();
