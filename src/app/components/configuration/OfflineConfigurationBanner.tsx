import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { ROUTES, WORKSPACE_SELECTION_ROUTE } from "../../auth/roleConfig";
import { isKnownRoute } from "../../auth/routeGuards";
import { routeRequiresDeviceSession } from "../../auth/workspaceRequirements";
import { useBootstrap } from "../../context/BootstrapContext";

export default function OfflineConfigurationBanner() {
  const bootstrap = useBootstrap();
  const auth = useAuth();
  const [path, setPath] = useState(() => window.location.hash.replace(/^#/, ""));
  useEffect(() => {
    const update = () => setPath(window.location.hash.replace(/^#/, ""));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const route = path === WORKSPACE_SELECTION_ROUTE ? ROUTES.deviceSetup : isKnownRoute(path) ? path : ROUTES.deviceSetup;
  const deviceRequired = routeRequiresDeviceSession(route, auth.currentRole, auth.isAuthenticated);
  if (!bootstrap.offline || !deviceRequired || auth.sessionInvalidated) return null;
  return <aside role="status" className="fixed inset-x-0 top-0 z-[100] flex min-h-11 items-center justify-center gap-3 border-b border-[#C41E19]/20 bg-[#FFFFFF] px-4 py-2 text-center text-xs font-bold text-[#C41E19] shadow-[0_4px_16px_rgba(31,31,31,.06)]">
    <CloudOff size={16} aria-hidden="true" />
    <span>{bootstrap.stale ? "Offline — cached configuration may be outdated." : "Offline — using cached restaurant configuration."}</span>
    <button type="button" onClick={() => void bootstrap.refresh()} className="flex min-h-9 items-center gap-1 rounded-xl border border-[#C41E19] bg-[#FFFFFF] px-3 transition hover:bg-[#C41E19] hover:text-[#FFFFFF] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]">
      <RefreshCw size={13} /> Retry
    </button>
  </aside>;
}
