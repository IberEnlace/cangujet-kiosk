import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Clock3, Printer, ReceiptText, RefreshCw } from "lucide-react";
import MorrowLogo from "../../components/branding/MorrowLogo";
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

  return <main dir={direction} className="min-h-[100dvh] bg-[#070a07] font-['DM_Sans'] text-[#f4f5ef]">
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[780px] flex-col overflow-hidden px-6 py-7 sm:px-12 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(215,251,105,.12),transparent_68%)]" />
      <header className="relative flex items-center justify-between">
        <MorrowLogo variant="full" priority className="h-auto w-36" />
        <span className="rounded-full border border-[#D7FB69]/20 bg-[#D7FB69]/8 px-4 py-2 text-[11px] font-black uppercase tracking-[.18em] text-[#D7FB69]">Pay at Cashier</span>
      </header>

      {phase === "printing" ? <section className="relative flex flex-1 flex-col items-center justify-center py-8 text-center" aria-live="polite">
        <div className="mb-3 grid size-14 place-items-center rounded-2xl border border-[#D7FB69]/20 bg-[#D7FB69]/10 text-[#D7FB69]"><Printer size={27} className="animate-pulse" /></div>
        <h1 className="mt-4 text-[clamp(2.25rem,6vw,4.5rem)] font-black leading-[.98] tracking-[-.05em]">Printing your ticket</h1>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/52">Please wait while we prepare your payment ticket.</p>
        <div className="mt-7 rounded-3xl border border-white/10 bg-white/[.035] px-9 py-5">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-white/35">Order number</p>
          <p className="mt-1 text-6xl font-black tracking-[-.04em] text-[#D7FB69]">{snapshot.orderNumber}</p>
        </div>
        <ReceiptPrinterAnimation status="printing" />
        <div className="mt-1 flex items-center gap-3 text-sm font-bold text-white/55"><span className="size-2 animate-pulse rounded-full bg-[#D7FB69]" />Printing…</div>
        <div className="mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-white/8"><div className="h-full origin-left animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[#D7FB69]" /></div>
      </section> : <section className="relative flex flex-1 flex-col items-center py-8 text-center" aria-live="polite">
        <div className="grid size-20 place-items-center rounded-full bg-[#D7FB69] text-[#17200f] shadow-[0_0_55px_rgba(215,251,105,.2)]"><CheckCircle2 size={43} strokeWidth={2.5} /></div>
        <h1 className="mt-6 text-[clamp(2.1rem,5.5vw,4rem)] font-black leading-[1.02] tracking-[-.045em]">Take your ticket to the cashier</h1>
        <p className="mt-3 text-lg text-white/52">Pay at the cashier using order number <strong className="text-white">{snapshot.orderNumber}</strong>.</p>

        <div className="mt-7 grid w-full gap-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:text-left">
          <div className="rounded-[28px] border border-[#D7FB69]/18 bg-[#D7FB69]/[.055] p-6">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#D7FB69]/65">Order number</p>
            <p className="mt-1 text-7xl font-black tracking-[-.06em] text-[#D7FB69]">{snapshot.orderNumber}</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-5">
              <div><p className="text-xs uppercase tracking-widest text-white/35">Total</p><p className="mt-1 text-3xl font-black">{money.format(Number(snapshot.total))}</p></div>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs font-bold text-amber-200"><Clock3 size={14} />Payment pending</span>
            </div>
          </div>
          <TicketSummary snapshot={snapshot} itemCount={itemCount} />
        </div>

        <div role="status" className={`mt-5 flex min-h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-bold ${printStatus === "printer_error" ? "border-amber-300/25 bg-amber-300/8 text-amber-100" : "border-[#D7FB69]/20 bg-[#D7FB69]/7 text-[#D7FB69]"}`}>
          {printStatus === "printer_error" ? <Printer size={17} /> : <Check size={17} />}
          {printStatus === "printer_error" ? "Your order is saved. Print the ticket again if needed." : printStatus === "printing" ? "Ticket created - sending it to the printer" : "Ticket created and sent to the printer"}
        </div>
      </section>}

      {phase === "ready" ? <footer className="relative border-t border-white/8 pt-5">
        <div className={`grid gap-3 ${printStatus === "printer_error" ? "sm:grid-cols-2" : ""}`}>
          {printStatus === "printer_error" ? <button type="button" onClick={() => { void invokePrint(false); }} className="min-h-16 rounded-2xl border border-white/15 bg-white/[.035] px-6 text-lg font-black transition hover:border-white/30"><RefreshCw className="me-2 inline" size={19} />Print Again</button> : null}
          <button type="button" onClick={finishSession} className="min-h-16 rounded-2xl bg-[#D7FB69] px-6 text-lg font-black text-[#17200f] shadow-[0_12px_34px_rgba(215,251,105,.14)] transition hover:bg-[#c9ed65] active:scale-[.99]">Finish</button>
        </div>
        <p className="mt-4 text-center text-sm text-white/42">Returning to the start screen in <strong className="font-mono text-white/75">{countdown}</strong> seconds</p>
      </footer> : null}
    </div>
  </main>;
}

function TicketSummary({ snapshot, itemCount }: { snapshot: PayAtCashierConfirmationSnapshot; itemCount: number }) {
  return <article dir="ltr" className="rotate-[.5deg] bg-[#fffdf7] px-5 py-5 text-left font-mono text-[#17200f] shadow-2xl shadow-black/30 [clip-path:polygon(0_0,100%_0,100%_96%,95%_100%,90%_96%,85%_100%,80%_96%,75%_100%,70%_96%,65%_100%,60%_96%,55%_100%,50%_96%,45%_100%,40%_96%,35%_100%,30%_96%,25%_100%,20%_96%,15%_100%,10%_96%,5%_100%,0_96%)]">
    <div className="flex items-center justify-between"><strong className="tracking-[.15em]">MORROW</strong><ReceiptText size={18} /></div>
    <p className="mt-3 border-y border-dashed border-black/25 py-3 text-center text-xs font-black">PAY AT CASHIER</p>
    <div className="mt-3 space-y-2 text-[11px]">
      <p className="flex justify-between"><span>Items</span><strong>{itemCount}</strong></p>
      <p className="flex justify-between"><span>Service</span><strong>{snapshot.serviceMode === "dine_in" ? "Dine In" : "Take Away"}</strong></p>
      <p className="flex justify-between"><span>Status</span><strong>Pending</strong></p>
    </div>
    <p className="mt-4 text-center text-[10px] text-black/55">Please take this ticket to the cashier.</p>
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
