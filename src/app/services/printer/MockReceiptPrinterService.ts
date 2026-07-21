import type { PrintResult, ReceiptData, ReceiptPrinterService } from "./ReceiptPrinterService";

export class MockReceiptPrinterService implements ReceiptPrinterService {
  async printReceipt(_receipt: ReceiptData): Promise<PrintResult> {
    await new Promise(resolve => window.setTimeout(resolve, 2_600));
    return { success: true };
  }
}
