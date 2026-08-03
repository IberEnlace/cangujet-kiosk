import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, Clock3, Loader2, TestTube2, XCircle } from "lucide-react";
import type { QrPaymentSession } from "../../../shared/orders";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { mockQrPaymentClient } from "../../services/orders/MockQrPaymentService";

export default function MockQrPayment({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<QrPaymentSession | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await mockQrPaymentClient.get(sessionId);
      setSession(next);
      setRemaining(secondsRemaining(next.expiresAt));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mock payment session is unavailable.");
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session || terminal(session.status)) return;
    const timer = window.setInterval(() => {
      const seconds = secondsRemaining(session.expiresAt);
      setRemaining(seconds);
      if (seconds === 0) void refresh();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, session?.expiresAt, session?.status]);

  const act = async (action: "success" | "fail" | "cancel") => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const next = action === "success"
        ? await mockQrPaymentClient.success(sessionId)
        : action === "fail"
          ? await mockQrPaymentClient.fail(sessionId)
          : await mockQrPaymentClient.cancel(sessionId);
      setSession(next);
      setRemaining(secondsRemaining(next.expiresAt));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The mock action could not be completed.");
    } finally { setBusy(false); }
  };

  const money = useMemo(() => session
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: session.currency }).format(Number(session.amount))
    : "—", [session]);
  const finished = session ? terminal(session.status) : false;

  return <main className="min-h-[100dvh] bg-[#070a07] px-5 py-8 font-['DM_Sans'] text-[#f4f5ef]">
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col">
      <header className="flex items-center justify-between gap-4">
        <MorrowLogo variant="full" priority className="h-auto w-36" />
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-200">Development Mode — No Real Money</span>
      </header>

      <section className="my-auto py-10 text-center" aria-live="polite">
        <div className="mx-auto grid size-20 place-items-center rounded-[24px] bg-[#D7FB69]/10 text-[#D7FB69]"><TestTube2 size={38} /></div>
        <h1 className="mt-6 text-4xl font-black tracking-[-.04em]">MORROW Mock Payment</h1>
        <p className="mt-2 text-white/45">Local payment simulator for development and testing.</p>

        {session ? <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[.045] p-6 text-start shadow-2xl shadow-black/30">
          <div className="grid grid-cols-2 gap-5">
            <Detail label="Order number" value={session.orderNumber} />
            <Detail label="Amount" value={money} accent />
            <Detail label="Status" value={session.status.replace("_", " ")} />
            <Detail label="Expires in" value={formatTime(remaining)} icon={<Clock3 size={17} />} />
          </div>
          {session.status === "paid" ? <Status icon={<Check size={34} />} title="Payment simulated successfully" copy="The kiosk will continue to the receipt and Kitchen will receive the submitted order." success /> : null}
          {session.status === "failed" || session.status === "expired" ? <Status icon={<XCircle size={34} />} title={session.status === "expired" ? "Session expired" : "Payment failed"} copy="No payment was captured and the order was not submitted." /> : null}
          {session.status === "cancelled" ? <Status icon={<Ban size={34} />} title="Payment cancelled" copy="The order remains outside Kitchen." /> : null}
        </div> : <div className="mt-10 flex items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" />Loading mock session…</div>}

        {error ? <p role="alert" className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      </section>

      {session && !finished ? <footer className="grid gap-3 border-t border-white/10 pt-5">
        <button type="button" disabled={busy} onClick={() => void act("success")} className="min-h-16 rounded-2xl bg-[#D7FB69] px-5 text-lg font-black text-[#17200f] disabled:opacity-50">{busy ? <Loader2 size={20} className="me-2 inline animate-spin" /> : <Check size={20} className="me-2 inline" />}Simulate Payment Success</button>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} onClick={() => void act("fail")} className="min-h-14 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 font-bold text-red-200 disabled:opacity-50">Simulate Failure</button>
          <button type="button" disabled={busy} onClick={() => void act("cancel")} className="min-h-14 rounded-2xl border border-white/15 bg-white/[.04] px-4 font-bold disabled:opacity-50">Cancel Payment</button>
        </div>
      </footer> : null}
    </div>
  </main>;
}

function Detail({ label, value, accent = false, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return <div><p className="text-xs font-bold uppercase tracking-[.16em] text-white/35">{label}</p><p className={`mt-1 flex items-center gap-2 text-xl font-black capitalize ${accent ? "text-[#D7FB69]" : ""}`}>{icon}{value}</p></div>;
}

function Status({ icon, title, copy, success = false }: { icon: React.ReactNode; title: string; copy: string; success?: boolean }) {
  return <div className={`mt-6 rounded-2xl border p-4 text-center ${success ? "border-[#D7FB69]/20 bg-[#D7FB69]/8 text-[#D7FB69]" : "border-white/10 bg-black/15 text-white/70"}`}><div className="flex justify-center">{icon}</div><p className="mt-2 font-black">{title}</p><p className="mt-1 text-sm opacity-70">{copy}</p></div>;
}

function terminal(status: QrPaymentSession["status"]) { return ["paid", "expired", "cancelled", "failed"].includes(status); }
function secondsRemaining(expiresAt: string) { return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000)); }
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
