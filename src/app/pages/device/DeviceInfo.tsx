import { useEffect } from "react";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";

export default function DeviceInfo({ onBack, onCleared }: { onBack: () => void; onCleared: () => void }) {
  const { config, reloadConfiguration, clearDeviceConfiguration } = useDevice();
  useEffect(() => { if (!config) onCleared(); }, [config, onCleared]);
  if (!config) return null;
  const rows = [["Kiosk name",config.kioskName],["Kiosk ID",config.kioskId],["Branch",config.branchName],["Restaurant",config.restaurantName],["Currency",config.currency],["Timezone",config.timezone],["Menu version",config.menuVersion ?? "—"],["Languages",config.settings.enabledLanguages.join(", ")],["Payment methods",config.settings.allowedPaymentMethods.join(", ")],["Configured",new Date(config.configuredAt).toLocaleString()]];
  const clear = async () => { if (!window.confirm("Clear this kiosk's device setup? The device will require its secret key again.")) return; await clearDeviceConfiguration(); onCleared(); };
  return <main className="min-h-screen bg-[#080b08] p-6 font-['DM_Sans'] text-white"><div className="mx-auto max-w-2xl"><header className="flex items-center justify-between"><MorrowLogo variant="full" className="h-auto w-40" /><button onClick={onBack} className="grid size-12 place-items-center rounded-xl bg-white/5"><ArrowLeft/></button></header><h1 className="mt-12 text-4xl font-bold">Device information</h1><div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-white/[.03]">{rows.map(([label,value]) => <div key={label} className="flex justify-between gap-5 border-b border-white/8 p-4 last:border-0"><span className="text-white/40">{label}</span><strong className="text-end">{value}</strong></div>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => void reloadConfiguration()} className="min-h-14 rounded-2xl bg-white/8 font-bold"><RefreshCw className="me-2 inline" size={17}/>Refresh configuration</button><button onClick={() => void clear()} className="min-h-14 rounded-2xl bg-red-500/10 font-bold text-red-300"><Trash2 className="me-2 inline" size={17}/>Clear device setup</button></div></div></main>;
}
