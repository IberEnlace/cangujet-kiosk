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
  return <main className="grid min-h-[100dvh] place-items-center bg-[#080b08] px-6 font-['Plus_Jakarta_Sans'] text-white"><div className="w-full max-w-md text-center"><MorrowLogo variant="symbol" priority className="mx-auto size-20 object-contain" />{message ? <div className="mt-7 rounded-3xl border border-white/10 bg-white/[.035] p-6"><AlertTriangle className="mx-auto text-[#C41E19]" /><h1 className="mt-4 text-xl font-bold">Device connection problem</h1><p className="mt-2 text-sm text-white/55">{message}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onRetry} className="min-h-12 rounded-2xl bg-[#C41E19] font-bold text-[#FFFFFF]"><RotateCcw className="me-2 inline" size={17}/>Retry</button><button type="button" onClick={onSetup} className="min-h-12 rounded-2xl bg-white/8 font-bold"><Settings className="me-2 inline" size={17}/>Device setup</button></div></div> : <div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#C41E19]" /></div>}</div></main>;
}
