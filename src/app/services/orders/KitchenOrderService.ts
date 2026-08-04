import type { ProductionOrder, ProductionOrderStatus } from "../../../shared/orders";
import { orderService, type OrderAuthentication } from "./OrderService";

export const COMPLETED_KITCHEN_VISIBILITY_MS = 5 * 60_000;

const NEXT_KITCHEN_STATUS: Partial<Record<ProductionOrderStatus, ProductionOrderStatus>> = {
  submitted: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "completed",
};

export class KitchenOrderService {
  list(authentication: OrderAuthentication = "staff") {
    return orderService.listKitchen(authentication);
  }

  next(order: ProductionOrder, authentication: OrderAuthentication = "staff") {
    const nextStatus = NEXT_KITCHEN_STATUS[order.status];
    if (!nextStatus) return Promise.resolve(order);
    return this.setStatus(order, nextStatus, undefined, authentication);
  }

  setStatus(order: ProductionOrder, nextStatus: ProductionOrderStatus, reason?: string, authentication: OrderAuthentication = "staff") {
    return orderService.transition(order.id, { nextStatus, expectedVersion: order.version, reason }, authentication);
  }
}

export const kitchenOrderService = new KitchenOrderService();
