import type { OrderType, PaymentMethod } from "../../context/CartContext";

export type ReceiptPrintStatus = "printing" | "printed" | "printer_error";

export type ReceiptData = {
  orderNumber: string | number;
  date: Date;
  orderType: OrderType;
  itemCount: number;
  total: number;
  paymentMethod: PaymentMethod;
};

export type PrintResult = { success: true } | { success: false; errorCode?: string };

export interface ReceiptPrinterService {
  printReceipt(receipt: ReceiptData): Promise<PrintResult>;
}
