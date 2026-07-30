import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import MorrowLogo from "../branding/MorrowLogo";
import { useBootstrap } from "../../context/BootstrapContext";

export default function ConfigurationLoadingScreen() {
  const bootstrap = useBootstrap();
  const loading = bootstrap.state === "loading_configuration" || bootstrap.state === "loading_menu";
  return <main className="grid min-h-[100dvh] place-items-center bg-[#080b08] p-6 font-['DM_Sans'] text-white">
    <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[.035] p-8 text-center">
      <MorrowLogo variant="symbol" className="mx-auto size-16" />
      {loading ? <><Loader2 className="mx-auto mt-7 animate-spin text-[#D7FB69]" /><h1 className="mt-5 text-2xl font-bold">{bootstrap.state === "loading_menu" ? "Loading menu" : "Loading restaurant configuration"}</h1><p className="mt-2 text-white/45">Applying the authenticated kiosk configuration.</p></> : <><AlertTriangle className="mx-auto mt-7 text-amber-300" /><h1 className="mt-5 text-2xl font-bold">Configuration could not be loaded</h1><p className="mt-2 text-white/45">{bootstrap.error?.message ?? "Restaurant configuration is unavailable."}</p><button type="button" onClick={() => void bootstrap.refresh()} className="mt-6 min-h-14 w-full rounded-2xl bg-[#D7FB69] font-bold text-[#17200f]"><RefreshCw className="me-2 inline" size={17} />Retry configuration</button></>}
    </section>
  </main>;
}
