import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, RotateCcw, Trash2 } from "lucide-react";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";
import type { DeviceStatus } from "../../types/device";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from "../../config/languages";

const copy = {
  en: { title: "Set up this kiosk", description: "Enter the device secret key provided for this kiosk.", label: "Device secret key", placeholder: "Enter secret key", connect: "Connect device", show: "Show key", hide: "Hide key", retry: "Retry", clear: "Clear setup", info: "Show device information", connected: "Device connected", invalid_key: ["Invalid device key", "Check the key and try again."], network_error: ["Unable to connect", "Check the kiosk internet connection and try again."], timeout: ["Connection timed out", "The device service did not respond. Try again."], disabled: ["This kiosk is disabled", "Contact your administrator."], configuration_error: ["Setup could not be completed", "The device configuration is incomplete or invalid."] },
  tr: { title: "Bu kiosku kurun", description: "Bu kiosk için verilen cihaz gizli anahtarını girin.", label: "Cihaz gizli anahtarı", placeholder: "Gizli anahtarı girin", connect: "Cihazı bağla", show: "Anahtarı göster", hide: "Anahtarı gizle", retry: "Tekrar dene", clear: "Kurulumu temizle", info: "Cihaz bilgilerini göster", connected: "Cihaz bağlandı", invalid_key: ["Geçersiz cihaz anahtarı", "Anahtarı kontrol edip tekrar deneyin."], network_error: ["Bağlantı kurulamadı", "Kioskun internet bağlantısını kontrol edip tekrar deneyin."], timeout: ["Bağlantı zaman aşımına uğradı", "Cihaz hizmeti yanıt vermedi. Tekrar deneyin."], disabled: ["Bu kiosk devre dışı", "Yöneticinizle iletişime geçin."], configuration_error: ["Kurulum tamamlanamadı", "Cihaz yapılandırması eksik veya geçersiz."] },
} as const;

type SetupLanguage = SupportedLanguage;
type ErrorStatus = Extract<DeviceStatus, "invalid_key" | "network_error" | "timeout" | "disabled" | "configuration_error">;
const errorStatuses: ErrorStatus[] = ["invalid_key", "network_error", "timeout", "disabled", "configuration_error"];

export default function DeviceSetup({ onConfigured, onDeviceInfo }: { onConfigured: () => void; onDeviceInfo: () => void }) {
  const { status, config, configureDevice, clearDeviceConfiguration } = useDevice();
  const [language, setLanguage] = useState<SetupLanguage>("en");
  const [secretKey, setSecretKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [validationError, setValidationError] = useState("");
  const text = copy[language];
  const error = errorStatuses.includes(status as ErrorStatus) ? text[status as ErrorStatus] : null;

  useEffect(() => { if (status !== "configured" || !config) return; const timer = window.setTimeout(onConfigured, 1500); return () => window.clearTimeout(timer); }, [config, onConfigured, status]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const trimmed = secretKey.trim();
    if (trimmed.length < 8 || trimmed.length > 128 || !/^[A-Za-z0-9_-]+$/.test(trimmed)) { setValidationError("Use 8–128 letters, numbers, hyphens, or underscores."); return; }
    setValidationError(""); const success = await configureDevice(trimmed); setSecretKey(""); if (!success) setVisible(false);
  };

  return <main dir="ltr" className="min-h-[100dvh] bg-[#080b08] px-5 py-8 font-['DM_Sans'] text-white sm:px-10">
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between"><MorrowLogo variant="full" priority className="h-auto w-44" /><div className="flex gap-1">{SUPPORTED_LANGUAGE_CODES.map(item => <button type="button" key={item} onClick={() => setLanguage(item)} className={`min-h-10 rounded-xl px-3 text-xs font-bold uppercase ${language === item ? "bg-[#D7FB69] text-[#17200f]" : "bg-white/5 text-white/45"}`}>{item}</button>)}</div></header>
      <section className="my-auto rounded-[2rem] border border-white/10 bg-white/[.035] p-[clamp(1.5rem,5vw,3rem)] shadow-2xl">
        {status === "configured" && config ? <div className="text-center"><CheckCircle2 className="mx-auto size-16 text-[#D7FB69]" /><h1 className="mt-6 text-3xl font-bold">{text.connected}</h1><p className="mt-4 text-xl">{config.kioskName}</p><p className="mt-1 text-white/45">{config.branchName}</p><button onClick={onConfigured} className="mt-8 min-h-14 w-full rounded-2xl bg-[#D7FB69] font-bold text-[#17200f]">Continue</button></div> : <>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.3em] text-[#D7FB69]">Device provisioning</p><h1 className="mt-4 text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-[-.05em]">{text.title}</h1><p className="mt-3 text-white/50">{text.description}</p>
          <form onSubmit={submit} className="mt-8"><label className="text-sm font-semibold text-white/70">{text.label}<div className="relative mt-2"><input type={visible ? "text" : "password"} value={secretKey} onChange={event => setSecretKey(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder={text.placeholder} className="min-h-16 w-full rounded-2xl border border-white/12 bg-black/25 px-5 pe-28 text-lg outline-none focus:border-[#D7FB69]/60" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute end-3 top-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs text-white/55">{visible ? <EyeOff size={17}/> : <Eye size={17}/>} {visible ? text.hide : text.show}</button></div></label>
            {(validationError || error) && <div role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-red-300" size={20}/><div><strong>{error?.[0] ?? "Invalid key format"}</strong><p className="mt-1 text-sm text-white/55">{error?.[1] ?? validationError}</p></div></div></div>}
            <button disabled={status === "connecting"} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#D7FB69] text-lg font-bold text-[#17200f] disabled:opacity-50">{status === "connecting" ? <Loader2 className="animate-spin"/> : error ? <RotateCcw/> : null}{error ? text.retry : text.connect}</button>
          </form>
        </>}
      </section>
      <footer className="flex flex-wrap justify-center gap-2 text-xs text-white/40">{config && <button onClick={onDeviceInfo} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/5 px-4"><Info size={15}/>{text.info}</button>}<button onClick={() => { void clearDeviceConfiguration(); setSecretKey(""); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/5 px-4"><Trash2 size={15}/>{text.clear}</button></footer>
    </div>
  </main>;
}
