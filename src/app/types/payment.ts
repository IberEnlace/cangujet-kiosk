export type CardPaymentStatus =
  | "waiting"
  | "reading"
  | "processing"
  | "approved"
  | "declined"
  | "cancelled"
  | "timeout"
  | "terminal_unavailable";

export type PaymentTerminalRequest = {
  orderId: string;
  amount: number;
  currency: string;
  timeoutMs?: number;
  onStatusChange?: (status: CardPaymentStatus) => void;
};

export type PaymentTerminalResult = {
  transactionId?: string;
  status: CardPaymentStatus;
  approvedAmount?: number;
};

export interface PaymentTerminalService {
  startPayment(request: PaymentTerminalRequest): Promise<PaymentTerminalResult>;
  cancelPayment(): Promise<void>;
}
