import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";

export default function DeviceInfo({ onBack, onCleared }: { onBack: () => void; onCleared: () => void }) {
  const { config, lifecycleState, reloadConfiguration, clearDeviceConfiguration } = useDevice();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { if (!config) onCleared(); }, [config, onCleared]);
  if (!config) return null;
  const rows = [
    ["Device name", config.kioskName],
    ["Device type", label(config.bootstrap.device.type)],
    ["Restaurant", config.restaurantName],
    ["Branch", config.branchName],
    ["Status", config.bootstrap.device.status],
    ["Connection", lifecycleState === "offline" ? "Offline — cached public configuration" : "Connected"],
    ["Last synchronization", new Date(config.configuredAt).toLocaleString()],
    ["App version", import.meta.env?.VITE_APP_VERSION ?? "web"],
  ];
  const refresh = async () => {
    setRefreshing(true);
    try { await reloadConfiguration(); } finally { setRefreshing(false); }
  };
  const logout = async () => {
    if (!window.confirm("Log out this device? A Secret Key will be required to activate it again.")) return;
    await clearDeviceConfiguration();
    onCleared();
  };
  return <main className="min-h-screen bg-[#080b08] p-6 font-['Plus_Jakarta_Sans'] text-white"><div className="mx-auto max-w-2xl"><header className="flex items-center justify-between"><MorrowLogo variant="full" className="h-auto w-40" /><button aria-label="Back" onClick={onBack} className="grid size-12 place-items-center rounded-xl bg-white/5"><ArrowLeft/></button></header><h1 className="mt-12 text-4xl font-bold">Device information</h1><p className="mt-2 text-white/45">Safe operational details for this installation.</p><div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-white/[.03]">{rows.map(([rowLabel,value]) => <div key={rowLabel} className="flex justify-between gap-5 border-b border-white/8 p-4 last:border-0"><span className="text-white/40">{rowLabel}</span><strong className="text-end capitalize">{value}</strong></div>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button disabled={refreshing} onClick={() => void refresh()} className="min-h-14 rounded-2xl bg-white/8 font-bold disabled:opacity-50"><RefreshCw className={`me-2 inline ${refreshing ? "animate-spin" : ""}`} size={17}/>Refresh configuration</button><button onClick={() => void logout()} className="min-h-14 rounded-2xl bg-red-500/10 font-bold text-red-300"><LogOut className="me-2 inline" size={17}/>Log out device</button></div><p className="mt-4 text-center text-xs text-white/30">An administrator can reset or revoke this device from Admin → Devices.</p></div></main>;
}

function label(value: string) {
  return value.replace(/_/g, " ");
}
