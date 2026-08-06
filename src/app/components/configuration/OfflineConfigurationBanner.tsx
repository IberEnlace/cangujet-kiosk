import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { WORKSPACE_SELECTION_ROUTE } from "../../auth/roleConfig";
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
  const route = isKnownRoute(path) ? path : WORKSPACE_SELECTION_ROUTE;
  const deviceRequired = routeRequiresDeviceSession(route, auth.currentRole, auth.isAuthenticated);
  if (!bootstrap.offline || !deviceRequired || auth.sessionInvalidated) return null;
  return <aside role="status" className="fixed inset-x-0 top-0 z-[100] flex min-h-11 items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-center text-xs font-bold text-[#2b2108] shadow-lg">
    <CloudOff size={16} aria-hidden="true" />
    <span>{bootstrap.stale ? "Offline — cached configuration may be outdated." : "Offline — using cached restaurant configuration."}</span>
    <button type="button" onClick={() => void bootstrap.refresh()} className="flex min-h-8 items-center gap-1 rounded-lg bg-black/10 px-3">
      <RefreshCw size={13} /> Retry
    </button>
  </aside>;
}
