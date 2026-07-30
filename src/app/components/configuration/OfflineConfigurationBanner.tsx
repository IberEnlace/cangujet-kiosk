import { CloudOff, RefreshCw } from "lucide-react";
import { useBootstrap } from "../../context/BootstrapContext";

export default function OfflineConfigurationBanner() {
  const bootstrap = useBootstrap();
  if (!bootstrap.offline) return null;
  return <aside role="status" className="fixed inset-x-0 top-0 z-[100] flex min-h-11 items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-center text-xs font-bold text-[#2b2108] shadow-lg">
    <CloudOff size={16} aria-hidden="true" />
    <span>{bootstrap.stale ? "Offline — cached configuration may be outdated." : "Offline — using cached restaurant configuration."}</span>
    <button type="button" onClick={() => void bootstrap.refresh()} className="flex min-h-8 items-center gap-1 rounded-lg bg-black/10 px-3">
      <RefreshCw size={13} /> Retry
    </button>
  </aside>;
}
