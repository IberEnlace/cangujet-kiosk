import type { PrintResult } from "./ReceiptPrinterService";
import type { PayAtCashierConfirmationSnapshot } from "../orders/payAtCashierConfirmation";

type PrinterRuntime = "production" | "development";
type PrintableWindow = Pick<Window, "focus" | "print"> & {
  document: Pick<Document, "open" | "write" | "close">;
};
type SilentPrintFrame = Pick<HTMLIFrameElement, "contentWindow" | "remove" | "setAttribute"> & {
  style: Pick<CSSStyleDeclaration, "cssText">;
};

type PrinterDependencies = {
  runtime?: PrinterRuntime;
  createSilentFrame?: () => SilentPrintFrame | null;
  appendSilentFrame?: (frame: SilentPrintFrame) => void;
  openDevelopmentWindow?: () => PrintableWindow | null;
  schedule?: (callback: () => void, delayMs: number) => void;
};

const PRINT_DELAY_MS = 100;
const FRAME_CLEANUP_DELAY_MS = 1_000;

export class PayAtCashierTicketPrinterService {
  private readonly runtime: PrinterRuntime;
  private readonly createSilentFrame: () => SilentPrintFrame | null;
  private readonly appendSilentFrame: (frame: SilentPrintFrame) => void;
  private readonly openDevelopmentWindow: () => PrintableWindow | null;
  private readonly schedule: (callback: () => void, delayMs: number) => void;

  constructor(dependencies: PrinterDependencies = {}) {
    this.runtime = dependencies.runtime ?? (import.meta.env.DEV ? "development" : "production");
    this.createSilentFrame = dependencies.createSilentFrame ?? (() => document.createElement("iframe"));
    this.appendSilentFrame = dependencies.appendSilentFrame ?? (frame => document.body.appendChild(frame as HTMLIFrameElement));
    this.openDevelopmentWindow = dependencies.openDevelopmentWindow
      ?? (() => window.open("", "_blank", "popup,width=340,height=720"));
    this.schedule = dependencies.schedule ?? ((callback, delayMs) => { window.setTimeout(callback, delayMs); });
  }

  async printTicket(ticket: PayAtCashierConfirmationSnapshot): Promise<PrintResult> {
    const html = renderPayAtCashierTicketHtml(ticket);
    if (this.runtime === "development") return this.printWithDevelopmentDialog(html);
    return this.printSilently(html);
  }

  /**
   * Production printing uses an off-screen 80mm document. Chrome is launched
   * with --kiosk-printing, so this print dispatch goes directly to the default
   * receipt printer without opening a popup or the native print dialog.
   */
  private async printSilently(html: string): Promise<PrintResult> {
    const frame = this.createSilentFrame();
    if (!frame) return { success: false, errorCode: "silent_print_unavailable" };
    try {
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;width:0;height:0;right:0;bottom:0;border:0;visibility:hidden";
      this.appendSilentFrame(frame);
      const target = frame.contentWindow as PrintableWindow | null;
      if (!target) {
        frame.remove();
        return { success: false, errorCode: "silent_print_unavailable" };
      }
      target.document.open();
      target.document.write(html);
      target.document.close();
      return await this.dispatchPrint(target, () => frame.remove());
    } catch {
      frame.remove();
      return { success: false, errorCode: "silent_print_failed" };
    }
  }

  /** Browser-dialog printing is intentionally available only for local dev. */
  private async printWithDevelopmentDialog(html: string): Promise<PrintResult> {
    const target = this.openDevelopmentWindow();
    if (!target) return { success: false, errorCode: "print_window_blocked" };
    try {
      target.document.open();
      target.document.write(html);
      target.document.close();
      return await this.dispatchPrint(target);
    } catch {
      return { success: false, errorCode: "print_failed" };
    }
  }

  private dispatchPrint(target: PrintableWindow, cleanup?: () => void) {
    return new Promise<PrintResult>(resolve => {
      this.schedule(() => {
        try {
          target.focus();
          target.print();
          resolve({ success: true });
        } catch {
          resolve({ success: false, errorCode: this.runtime === "production" ? "silent_print_failed" : "print_failed" });
        } finally {
          if (cleanup) this.schedule(cleanup, FRAME_CLEANUP_DELAY_MS);
        }
      }, PRINT_DELAY_MS);
    });
  }
}

export function renderPayAtCashierTicketHtml(ticket: PayAtCashierConfirmationSnapshot) {
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: ticket.currency });
  const items = ticket.items.map(item => `<li><strong>${escapeHtml(item.name)} × ${item.quantity}</strong>${item.modifiers.length ? `<small>${item.modifiers.map(escapeHtml).join(", ")}</small>` : ""}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>MORROW ${escapeHtml(ticket.orderNumber)}</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:80mm;margin:0;padding:7mm 5mm;background:#fff;color:#111;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}h1,h2,p{margin:0;text-align:center}h1{font:900 22px Arial,sans-serif;letter-spacing:.18em}h2{margin-top:2mm;font-size:14px}.number{margin:5mm 0;border-block:1px dashed #555;padding:4mm 0;font:900 34px Arial,sans-serif}ul{margin:4mm 0;padding:0;list-style:none}li{padding:2mm 0;border-bottom:1px dotted #aaa}small{display:block;color:#555;margin-top:1mm}.row{display:flex;justify-content:space-between;margin-top:1.5mm}.total{margin-top:2mm;border-top:2px solid #111;padding-top:2mm;font-weight:900;font-size:15px}.pending{margin:4mm 0 2mm;font-weight:900}.instruction{margin-top:4mm}.created{margin-top:4mm;color:#555;font-size:10px}</style></head><body>
    <h1>MORROW</h1><h2>PAY AT CASHIER</h2><p>Order Number</p><p class="number">${escapeHtml(ticket.orderNumber)}</p><ul>${items}</ul>
    <div class="row"><span>Subtotal</span><span>${money.format(Number(ticket.subtotal))}</span></div><div class="row"><span>Tax</span><span>${money.format(Number(ticket.taxTotal))}</span></div><div class="row total"><span>Total</span><span>${money.format(Number(ticket.total))}</span></div>
    <p class="pending">Payment Status: Pending</p><p class="instruction">Please take this ticket to the cashier.</p><p class="created">${escapeHtml(new Date(ticket.createdAt).toLocaleString())}</p>
  </body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
