import type { OrderPaymentResult, ProductionOrder, ProductionPaymentMethod } from "../../../shared/orders";
import { orderService, type OrderAuthentication } from "./OrderService";

export interface PaymentAdapter {
  capture(input: {
    order: ProductionOrder;
    idempotencyKey: string;
    amountReceived?: string;
    externalReference?: string;
    authentication: OrderAuthentication;
  }): Promise<OrderPaymentResult>;
}

class ApiPaymentAdapter implements PaymentAdapter {
  constructor(private readonly method: ProductionPaymentMethod) {}
  capture(input: Parameters<PaymentAdapter["capture"]>[0]) {
    return orderService.pay(input.order.id, {
      idempotencyKey: input.idempotencyKey,
      method: this.method,
      amountReceived: input.amountReceived,
      externalReference: input.externalReference,
    }, input.authentication);
  }
}

export const paymentAdapters = {
  cash: new ApiPaymentAdapter("cash"),
  payAtCashier: new ApiPaymentAdapter("pay_at_cashier"),
  cardTerminal: new ApiPaymentAdapter("card_terminal"),
};
