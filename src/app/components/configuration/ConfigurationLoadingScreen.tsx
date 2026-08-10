import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import CangujetLogo from "../branding/CangujetLogo";
import { useBootstrap } from "../../context/BootstrapContext";

export default function ConfigurationLoadingScreen() {
  const bootstrap = useBootstrap();
  const loading = bootstrap.state === "loading_configuration" || bootstrap.state === "loading_menu";
  return <main className="grid min-h-[100dvh] place-items-center bg-[#F8F9FA] p-6 text-[#1F1F1F]">
    <section className="w-full max-w-lg rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-8 text-center shadow-[0_10px_30px_rgba(31,31,31,.07)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(31,31,31,.09)]">
      <CangujetLogo variant="symbol" className="mx-auto size-16" />
      {loading ? <><Loader2 className="mx-auto mt-7 animate-spin text-[#C41E19]" /><h1 className="mt-5 text-2xl font-bold tracking-[-.025em]">{bootstrap.state === "loading_menu" ? "Loading menu" : "Loading restaurant configuration"}</h1><p className="mt-2 text-sm text-[#6B7280]">Applying the authenticated kiosk configuration.</p></> : <><AlertTriangle className="mx-auto mt-7 text-[#C41E19]" /><h1 className="mt-5 text-2xl font-bold tracking-[-.025em]">Configuration could not be loaded</h1><p className="mt-2 text-sm text-[#6B7280]">{bootstrap.error?.message ?? "Restaurant configuration is unavailable."}</p><button type="button" onClick={() => void bootstrap.refresh()} className="mt-6 min-h-14 w-full rounded-2xl bg-[#C41E19] font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><RefreshCw className="me-2 inline" size={17} />Retry configuration</button></>}
    </section>
  </main>;
}
