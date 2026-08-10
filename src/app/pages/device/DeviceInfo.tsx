import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import CangujetLogo from "../../components/branding/CangujetLogo";
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
  return <main className="min-h-screen bg-[#F8F9FA] p-6 text-[#1F1F1F]"><div className="mx-auto max-w-2xl"><header className="flex items-center justify-between"><CangujetLogo variant="full" className="h-auto w-40" /><button aria-label="Back" onClick={onBack} className="grid size-12 place-items-center rounded-xl border border-[#ECECEC] bg-[#FFFFFF] text-[#1F1F1F] shadow-[0_4px_12px_rgba(31,31,31,.05)] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><ArrowLeft/></button></header><h1 className="mt-12 text-4xl font-bold tracking-[-.035em]">Device information</h1><p className="mt-2 text-[#6B7280]">Safe operational details for this installation.</p><div className="mt-7 overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] shadow-[0_8px_24px_rgba(31,31,31,.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(31,31,31,.08)]">{rows.map(([rowLabel,value]) => <div key={rowLabel} className="flex justify-between gap-5 border-b border-[#ECECEC] p-4 transition hover:bg-[#F8F9FA] last:border-0"><span className="text-[#6B7280]">{rowLabel}</span><strong className="text-end capitalize text-[#1F1F1F]">{value}</strong></div>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button disabled={refreshing} onClick={() => void refresh()} className="min-h-14 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] font-bold text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] disabled:opacity-50"><RefreshCw className={`me-2 inline ${refreshing ? "animate-spin" : ""}`} size={17}/>Refresh configuration</button><button onClick={() => void logout()} className="min-h-14 rounded-2xl border border-[#C41E19] bg-[#FFFFFF] font-bold text-[#C41E19] transition hover:-translate-y-0.5 hover:bg-[#C41E19] hover:text-[#FFFFFF] active:scale-[.98]"><LogOut className="me-2 inline" size={17}/>Log out device</button></div><p className="mt-4 text-center text-xs text-[#9CA3AF]">An administrator can reset or revoke this device from Admin → Devices.</p></div></main>;
}

function label(value: string) {
  return value.replace(/_/g, " ");
}
