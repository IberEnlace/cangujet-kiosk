import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import ReceiptPrinterAnimation from "../../components/customer/ReceiptPrinterAnimation";
import ReceiptPreview from "../../components/customer/ReceiptPreview";
import { useCart } from "../../context/CartContext";
import { useLanguage } from "../../context/LanguageContext";
import { getCustomerTranslation } from "../../i18n/customerTranslations";
import { MockReceiptPrinterService } from "../../services/printer/MockReceiptPrinterService";
import MorrowLogo from "../../components/branding/MorrowLogo";
import type { ReceiptData, ReceiptPrintStatus } from "../../services/printer/ReceiptPrinterService";
import { useDevice } from "../../context/DeviceContext";
import { useOrderTracking } from "../../hooks/useRealtimeOrders";

export default function OrderConfirmation({ onReset }: { onReset: () => void }) {
  const {
    queueNumber, currentOrderId, currentOrderNumber, currentTrackingToken, items, confirmedOrderItems,
    total, orderType, paymentMethod,
  } = useCart();
  const tracking = useOrderTracking(currentOrderId, currentTrackingToken);
  const { config } = useDevice();
  const printingEnabled = config?.settings.receiptPrintingEnabled ?? false;
  const { language, direction } = useLanguage();
  const copy = getCustomerTranslation(language).orderConfirmation;
  const printer = useMemo(() => new MockReceiptPrinterService(), []);
  const [printStatus, setPrintStatus] = useState<ReceiptPrintStatus>(printingEnabled ? "printing" : "printed");
  const [countdown, setCountdown] = useState(18);
  const printStartedRef = useRef(false);
  const receiptDateRef = useRef(new Date());
  const receiptItems = confirmedOrderItems.length ? confirmedOrderItems : items;
  const itemCount = receiptItems.reduce((sum, item) => sum + item.qty, 0);
  const receipt: ReceiptData | null = queueNumber && orderType && paymentMethod
    ? { orderNumber: queueNumber, date: receiptDateRef.current, orderType, itemCount, total, paymentMethod }
    : null;

  const printReceipt = useCallback(async () => {
    if (!receipt || !printingEnabled) { setPrintStatus("printed"); return; }
    setPrintStatus("printing");
    const result = await printer.printReceipt(receipt);
    setPrintStatus(result.success ? "printed" : "printer_error");
  }, [printer, printingEnabled, receipt]);

  useEffect(() => {
    if (!receipt || printStartedRef.current) return;
    printStartedRef.current = true;
    void printReceipt();
  }, [printReceipt, receipt]);

  useEffect(() => {
    if (printStatus !== "printed") return;
    setCountdown(18);
    const timer = window.setInterval(() => setCountdown(value => {
      if (value <= 1) { window.clearInterval(timer); onReset(); return 0; }
      return value - 1;
    }), 1_000);
    return () => window.clearInterval(timer);
  }, [onReset, printStatus]);

  useEffect(() => { if (!queueNumber || !currentOrderId) onReset(); }, [currentOrderId, onReset, queueNumber]);

  if (!receipt) return null;
  const statusText = printStatus === "printing" ? copy.printing : printStatus === "printed" ? copy.printed : copy.printError;

  return (
    <main dir={direction} className="h-screen h-[100dvh] overflow-hidden bg-[#F8F9FA] text-[#1F1F1F]">
      <div className="confirmation-layout mx-auto grid h-full w-full max-w-[900px] grid-rows-[auto_minmax(0,1fr)_auto] px-4 pt-4 text-center sm:px-8 sm:pt-6">
        <header className="flex flex-col items-center">
          <MorrowLogo variant="full" priority className="h-auto w-36" />
          <h1 className="mt-3 text-[clamp(1.5rem,3.2vw,2.35rem)] font-bold tracking-[-.04em]">{copy.title}</h1>
          <p className="mt-1 text-[clamp(.78rem,1.45vw,1rem)] text-[#6B7280]">{copy.subtitle}</p>
        </header>

        <section className="grid min-h-0 content-center gap-3 py-2 sm:gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9CA3AF]">{copy.orderNumber}</p>
            <p className="text-[clamp(4.6rem,14dvh,8.5rem)] font-black leading-[.85] tabular-nums text-[#C41E19]">{currentOrderNumber}</p>
          </div>

          <div className="confirmation-receipt-grid mx-auto grid min-h-0 w-full max-w-3xl items-center gap-3 min-[680px]:grid-cols-2">
            <div className="grid content-center gap-2">
              {printingEnabled && <ReceiptPrinterAnimation status={printStatus} />}
              <div role="status" className={`mx-auto flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${printStatus === "printer_error" ? "border-[#C41E19]/30 bg-[#FFFFFF] text-[#C41E19]" : "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]"}`}>{printingEnabled && <Printer size={16} className={printStatus === "printing" ? "animate-pulse" : ""} />}{printingEnabled ? statusText : "Digital receipt ready"}</div>
            </div>
            <div className="flex min-h-0 justify-center"><ReceiptPreview {...receipt} language={language} /></div>
          </div>
        </section>

        <footer className="border-t border-[#ECECEC] pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-[clamp(.92rem,1.8vw,1.2rem)] font-semibold leading-snug">{copy.instruction}</p>
          <p className="mt-1 text-[clamp(.72rem,1.3vw,.9rem)] leading-snug text-[#6B7280]">{copy.collectAtCounter}</p>
          {tracking.tracking && <p role="status" className="mt-1 text-xs font-semibold capitalize text-[#C41E19]">Live order status: {tracking.tracking.status}</p>}
          {printStatus === "printer_error" && <p className="mt-1 text-xs text-[#C41E19]">{copy.errorHelp}</p>}
          <p className={`mt-2 min-h-5 text-[clamp(.75rem,1.3vw,.9rem)] text-[#C41E19] ${printStatus === "printed" ? "visible" : "invisible"}`}>{copy.returningIn.replace("{seconds}", String(countdown))}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {printStatus === "printer_error" && <button type="button" onClick={printReceipt} className="min-h-14 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-5 text-base font-bold text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98]"><RefreshCw className="me-2 inline" size={18} />{copy.retryPrint}</button>}
            <button type="button" onClick={onReset} className={`min-h-16 rounded-2xl bg-[#C41E19] px-6 text-lg font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] ${printStatus !== "printer_error" ? "sm:col-span-2" : ""}`}>{printStatus === "printer_error" ? copy.continueWithoutReceipt : copy.startNewOrder}</button>
          </div>
        </footer>
      </div>
    </main>
  );
}
