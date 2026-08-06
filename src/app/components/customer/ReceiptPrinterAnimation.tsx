import { Check } from "lucide-react";
import type { ReceiptPrintStatus } from "../../services/printer/ReceiptPrinterService";
import MorrowLogo from "../branding/MorrowLogo";

export default function ReceiptPrinterAnimation({ status }: { status: ReceiptPrintStatus }) {
  return <div className="confirmation-printer-visual relative mx-auto h-52 w-64" aria-hidden="true">
    <div className={`absolute left-1/2 top-5 h-44 w-44 -translate-x-1/2 rounded-t-lg border border-[#ECECEC] bg-[#FFFFFF] p-4 text-[#1F1F1F] shadow-[0_8px_24px_rgba(31,31,31,.08)] transition-transform duration-[2400ms] ease-out ${status === "printing" ? "translate-y-16 animate-[receipt-slide_2.4s_ease-out_forwards]" : "translate-y-0"}`}>
      <div className="mx-auto h-2 w-16 rounded bg-[#ECECEC]" /><div className="mt-5 space-y-2"><div className="h-1.5 rounded bg-[#ECECEC]" /><div className="h-1.5 w-3/4 rounded bg-[#ECECEC]" /><div className="h-px bg-[#ECECEC]" /><div className="h-1.5 w-1/2 rounded bg-[#ECECEC]" /></div>
    </div>
    <div className="absolute inset-x-0 bottom-0 h-28 rounded-[26px] border border-[#ECECEC] bg-[#FFFFFF] shadow-[0_12px_32px_rgba(31,31,31,.10)]"><div className="mx-auto mt-6 h-3.5 w-40 rounded-full bg-[#1F1F1F] shadow-inner" /><div className="mx-auto mt-5 flex w-44 items-center justify-between"><MorrowLogo variant="symbol" className="size-7 object-contain" alt="" /><span className={`grid size-7 place-items-center rounded-full ${status === "printed" ? "bg-[#C41E19] text-[#FFFFFF]" : "bg-[#F8F9FA] text-[#9CA3AF]"}`}>{status === "printed" && <Check size={16} />}</span></div></div>
  </div>;
}
