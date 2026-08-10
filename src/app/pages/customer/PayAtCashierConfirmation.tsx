import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Clock3, Printer, ReceiptText, RefreshCw } from "lucide-react";
import CangujetLogo from "../../components/branding/CangujetLogo";
import ReceiptPrinterAnimation from "../../components/customer/ReceiptPrinterAnimation";
import { useLanguage } from "../../context/LanguageContext";
import {
  beginPayAtCashierPrintRetry,
  claimPayAtCashierAutomaticPrint,
  clearPayAtCashierConfirmation,
  completePayAtCashierPrint,
  readPayAtCashierConfirmation,
  type PayAtCashierConfirmationSnapshot,
} from "../../services/orders/payAtCashierConfirmation";
import { PayAtCashierTicketPrinterService } from "../../services/printer/PayAtCashierTicketPrinterService";
import type { ReceiptPrintStatus } from "../../services/printer/ReceiptPrinterService";

const PRINTING_ANIMATION_MS = 2_500;
const PRINT_RESULT_TIMEOUT_MS = 4_000;
const READY_LIFETIME_SECONDS = 15;

export default function PayAtCashierConfirmation({ onReset }: { onReset: () => void }) {
  const { direction } = useLanguage();
  const [snapshot, setSnapshot] = useState<PayAtCashierConfirmationSnapshot | null>(() => readPayAtCashierConfirmation());
  const [phase, setPhase] = useState<"printing" | "ready">("printing");
  const [printStatus, setPrintStatus] = useState<ReceiptPrintStatus>("printing");
  const [countdown, setCountdown] = useState(READY_LIFETIME_SECONDS);
  const printer = useMemo(() => new PayAtCashierTicketPrinterService(), []);
  const hasPrintedRef = useRef(false);
  const finishOnceRef = useRef(false);
  const mountedRef = useRef(true);

  const finishSession = useCallback(() => {
    if (finishOnceRef.current) return;
    finishOnceRef.current = true;
    clearPayAtCashierConfirmation();
    onReset();
  }, [onReset]);

  const invokePrint = useCallback(async (automatic: boolean) => {
    if (automatic && hasPrintedRef.current) return;
    const claimed = automatic
      ? claimPayAtCashierAutomaticPrint()
      : beginPayAtCashierPrintRetry();
    if (!claimed) return;
    hasPrintedRef.current = true;
    setPrintStatus("printing");
    // The customer viewing period must not wait for a native print dialog or a
    // printer driver promise. Dispatch printing, reveal the ticket, then update
    // the recoverable print result independently.
    const printResult = printer.printTicket(claimed);
    setPhase("ready");
    const result = await withPrintTimeout(printResult);
    const updated = completePayAtCashierPrint(result.success);
    if (!mountedRef.current) return;
    if (updated) setSnapshot(updated);
    setPrintStatus(result.success ? "printed" : "printer_error");
  }, [printer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!snapshot) { finishSession(); return; }
    if (snapshot.printState === "printed") {
      hasPrintedRef.current = true;
      setPrintStatus("printed");
      setPhase("ready");
      return;
    }
    if (snapshot.printState === "failed") {
      hasPrintedRef.current = true;
      setPrintStatus("printer_error");
      setPhase("ready");
      return;
    }
    if (snapshot.printState === "printing") {
      // A refresh after the durable claim must never trigger a second automatic
      // ticket. The customer may explicitly choose Print Again instead.
      hasPrintedRef.current = true;
      const updated = completePayAtCashierPrint(false);
      if (updated) setSnapshot(updated);
      setPrintStatus("printer_error");
      setPhase("ready");
      return;
    }
    const timer = window.setTimeout(() => { void invokePrint(true); }, PRINTING_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [finishSession, invokePrint, snapshot]);

  useEffect(() => {
    if (phase !== "ready") return;
    setCountdown(READY_LIFETIME_SECONDS);
    const interval = window.setInterval(() => {
      setCountdown(value => Math.max(0, value - 1));
    }, 1_000);
    const timeout = window.setTimeout(finishSession, READY_LIFETIME_SECONDS * 1_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [finishSession, phase]);

  if (!snapshot) return null;

  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: snapshot.currency });
  const itemCount = snapshot.items.reduce((sum, item) => sum + item.quantity, 0);

  return <main dir={direction} className="min-h-[100dvh] bg-[#F8F9FA] text-[#1F1F1F]">
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[780px] flex-col overflow-hidden px-6 py-7 sm:px-12 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(196,30,25,.045),transparent_68%)]" />
      <header className="relative flex items-center justify-between">
        <CangujetLogo variant="full" priority className="h-auto w-36" />
        <span className="rounded-full border border-[#C41E19]/20 bg-[#FFFFFF] px-4 py-2 text-[11px] font-black uppercase tracking-[.18em] text-[#C41E19] shadow-[0_3px_10px_rgba(31,31,31,.04)]">Pay at Cashier</span>
      </header>

      {phase === "printing" ? <section className="relative flex flex-1 flex-col items-center justify-center py-8 text-center" aria-live="polite">
        <div className="mb-3 grid size-14 place-items-center rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/10 text-[#C41E19]"><Printer size={27} className="animate-pulse" /></div>
        <h1 className="mt-4 text-[clamp(2.25rem,6vw,4.5rem)] font-black leading-[.98] tracking-[-.05em]">Printing your ticket</h1>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-[#6B7280]">Please wait while we prepare your payment ticket.</p>
        <div className="mt-7 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-9 py-5 shadow-[0_8px_24px_rgba(31,31,31,.06)]">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#9CA3AF]">Order number</p>
          <p className="mt-1 text-6xl font-black tracking-[-.04em] text-[#C41E19]">{snapshot.orderNumber}</p>
        </div>
        <ReceiptPrinterAnimation status="printing" />
        <div className="mt-1 flex items-center gap-3 text-sm font-bold text-[#6B7280]"><span className="size-2 animate-pulse rounded-full bg-[#C41E19]" />Printing…</div>
        <div className="mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-[#ECECEC]"><div className="h-full origin-left animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[#C41E19]" /></div>
      </section> : <section className="relative flex flex-1 flex-col items-center py-8 text-center" aria-live="polite">
        <div className="grid size-20 place-items-center rounded-full bg-[#C41E19] text-[#FFFFFF] shadow-[0_10px_26px_rgba(196,30,25,.18)]"><CheckCircle2 size={43} strokeWidth={2.5} /></div>
        <h1 className="mt-6 text-[clamp(2.1rem,5.5vw,4rem)] font-black leading-[1.02] tracking-[-.045em]">Take your ticket to the cashier</h1>
        <p className="mt-3 text-lg text-[#6B7280]">Pay at the cashier using order number <strong className="text-[#1F1F1F]">{snapshot.orderNumber}</strong>.</p>

        <div className="mt-7 grid w-full gap-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:text-left">
          <div className="rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-6 shadow-[0_8px_24px_rgba(31,31,31,.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(31,31,31,.08)]">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#C41E19]/65">Order number</p>
            <p className="mt-1 text-7xl font-black tracking-[-.06em] text-[#C41E19]">{snapshot.orderNumber}</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-[#ECECEC] pt-5">
              <div><p className="text-xs uppercase tracking-widest text-[#9CA3AF]">Total</p><p className="mt-1 text-3xl font-black">{money.format(Number(snapshot.total))}</p></div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#C41E19]/20 bg-[#C41E19]/5 px-3 py-2 text-xs font-bold text-[#C41E19]"><Clock3 size={14} />Payment pending</span>
            </div>
          </div>
          <TicketSummary snapshot={snapshot} itemCount={itemCount} />
        </div>

        <div role="status" className={`mt-5 flex min-h-12 items-center gap-2 rounded-2xl border bg-[#FFFFFF] px-4 text-sm font-bold ${printStatus === "printer_error" ? "border-[#C41E19]/30 text-[#C41E19]" : "border-[#C41E19]/20 text-[#C41E19]"}`}>
          {printStatus === "printer_error" ? <Printer size={17} /> : <Check size={17} />}
          {printStatus === "printer_error" ? "Your order is saved. Print the ticket again if needed." : printStatus === "printing" ? "Ticket created - sending it to the printer" : "Ticket created and sent to the printer"}
        </div>
      </section>}

      {phase === "ready" ? <footer className="relative border-t border-[#ECECEC] pt-5">
        <div className={`grid gap-3 ${printStatus === "printer_error" ? "sm:grid-cols-2" : ""}`}>
          {printStatus === "printer_error" ? <button type="button" onClick={() => { void invokePrint(false); }} className="min-h-16 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-6 text-lg font-black text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98]"><RefreshCw className="me-2 inline" size={19} />Print Again</button> : null}
          <button type="button" onClick={finishSession} className="min-h-16 rounded-2xl bg-[#C41E19] px-6 text-lg font-black text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98]">Finish</button>
        </div>
        <p className="mt-4 text-center text-sm text-[#6B7280]">Returning to the start screen in <strong className="tabular-nums text-[#1F1F1F]">{countdown}</strong> seconds</p>
      </footer> : null}
    </div>
  </main>;
}

function TicketSummary({ snapshot, itemCount }: { snapshot: PayAtCashierConfirmationSnapshot; itemCount: number }) {
  return <article dir="ltr" className="rotate-[.5deg] bg-[#FFFFFF] px-5 py-5 text-left text-[#1F1F1F] shadow-[0_10px_28px_rgba(31,31,31,.10)] [clip-path:polygon(0_0,100%_0,100%_96%,95%_100%,90%_96%,85%_100%,80%_96%,75%_100%,70%_96%,65%_100%,60%_96%,55%_100%,50%_96%,45%_100%,40%_96%,35%_100%,30%_96%,25%_100%,20%_96%,15%_100%,10%_96%,5%_100%,0_96%)]">
    <div className="flex items-center justify-between"><strong className="tracking-[.15em]">cangujet</strong><ReceiptText size={18} /></div>
    <p className="mt-3 border-y border-dashed border-[#ECECEC] py-3 text-center text-xs font-black">PAY AT CASHIER</p>
    <div className="mt-3 space-y-2 text-[11px]">
      <p className="flex justify-between"><span>Items</span><strong>{itemCount}</strong></p>
      <p className="flex justify-between"><span>Service</span><strong>{snapshot.serviceMode === "dine_in" ? "Dine In" : "Take Away"}</strong></p>
      <p className="flex justify-between"><span>Status</span><strong>Pending</strong></p>
    </div>
    <p className="mt-4 text-center text-[10px] text-[#6B7280]">Please take this ticket to the cashier.</p>
  </article>;
}

function withPrintTimeout(result: Promise<{ success: true } | { success: false; errorCode?: string }>) {
  return new Promise<{ success: true } | { success: false; errorCode?: string }>(resolve => {
    let settled = false;
    const finish = (value: { success: true } | { success: false; errorCode?: string }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish({ success: false, errorCode: "print_timeout" }), PRINT_RESULT_TIMEOUT_MS);
    void result.then(finish, () => finish({ success: false, errorCode: "print_failed" }));
  });
}
