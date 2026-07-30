import { orderService } from "./OrderService";

export class OrderTrackingService {
  get(customerReference: string) {
    return orderService.tracking(customerReference);
  }
}

export const orderTrackingService = new OrderTrackingService();
