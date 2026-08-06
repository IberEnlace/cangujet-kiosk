import { AlertTriangle, RotateCcw, Settings } from "lucide-react";
import MorrowLogo from "../branding/MorrowLogo";
import type { DeviceErrorStatus } from "../../types/device";

export default function DeviceLoadingScreen({
  error,
  onRetry,
  onSetup,
}: {
  error?: DeviceErrorStatus;
  onRetry?: () => void;
  onSetup?: () => void;
}) {
  const message = error === "timeout"
    ? "The device service did not respond in time."
    : error === "disabled"
      ? "This kiosk is disabled. Contact your administrator."
      : error === "expired"
        ? "This device credential has expired."
      : error === "session_expired"
        ? "This device needs to be activated again."
      : error === "server_error"
        ? "The device service is temporarily unavailable."
          : error === "protocol_error"
            ? "The device server returned an unexpected response."
      : error === "configuration_error"
        ? "The device configuration is incomplete or invalid."
        : error
          ? "The device service could not be reached."
          : null;
  return <main className="grid min-h-[100dvh] place-items-center bg-[#F8F9FA] px-6 text-[#1F1F1F]"><div className="w-full max-w-md text-center"><MorrowLogo variant="symbol" priority className="mx-auto size-20 object-contain" />{message ? <div className="mt-7 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-6 shadow-[0_10px_30px_rgba(31,31,31,.07)]"><AlertTriangle className="mx-auto text-[#C41E19]" /><h1 className="mt-4 text-xl font-bold tracking-[-.025em]">Device connection problem</h1><p className="mt-2 text-sm leading-6 text-[#6B7280]">{message}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onRetry} className="min-h-12 rounded-2xl bg-[#C41E19] font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><RotateCcw className="me-2 inline" size={17}/>Retry</button><button type="button" onClick={onSetup} className="min-h-12 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] font-bold text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><Settings className="me-2 inline" size={17}/>Device setup</button></div></div> : <div className="mx-auto mt-6 h-1.5 w-28 overflow-hidden rounded-full bg-[#ECECEC]"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#C41E19]" /></div>}</div></main>;
}
