import type { CardPaymentStatus, PaymentTerminalRequest, PaymentTerminalResult, PaymentTerminalService } from "../../types/payment";

export class MockPaymentTerminalService implements PaymentTerminalService {
  private timers = new Set<number>();
  private resolveResult: ((result: PaymentTerminalResult) => void) | null = null;
  private request: PaymentTerminalRequest | null = null;
  private settled = false;

  startPayment(request: PaymentTerminalRequest): Promise<PaymentTerminalResult> {
    void this.cancelPayment();
    this.request = request;
    this.settled = false;
    request.onStatusChange?.("waiting");

    return new Promise(resolve => {
      this.resolveResult = resolve;
      this.schedule(() => this.complete("timeout"), request.timeoutMs ?? 75_000);
      if (import.meta.env.DEV) {
        this.schedule(() => this.emit("reading"), 2_000);
        this.schedule(() => this.emit("processing"), 3_200);
        this.schedule(() => this.complete("approved"), 4_800);
      } else {
        this.schedule(() => this.complete("terminal_unavailable"), 800);
      }
    });
  }

  async cancelPayment(): Promise<void> {
    if (!this.settled && this.resolveResult) this.complete("cancelled");
    this.clearTimers();
  }

  simulate(status: Extract<CardPaymentStatus, "approved" | "declined" | "terminal_unavailable">): void {
    if (import.meta.env.DEV) this.complete(status);
  }

  private emit(status: CardPaymentStatus): void {
    if (!this.settled) this.request?.onStatusChange?.(status);
  }

  private complete(status: CardPaymentStatus): void {
    if (this.settled || !this.resolveResult) return;
    this.settled = true;
    this.clearTimers();
    this.request?.onStatusChange?.(status);
    const resolve = this.resolveResult;
    const amount = this.request?.amount;
    this.resolveResult = null;
    resolve({
      status,
      approvedAmount: status === "approved" ? amount : undefined,
      transactionId: status === "approved" ? `mock-${Date.now()}` : undefined,
    });
  }

  private schedule(callback: () => void, delay: number): void {
    const timer = window.setTimeout(() => { this.timers.delete(timer); callback(); }, delay);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    this.timers.forEach(timer => window.clearTimeout(timer));
    this.timers.clear();
  }
}
