import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, RotateCcw, Trash2 } from "lucide-react";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";
import type { DeviceStatus } from "../../types/device";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from "../../config/languages";
import { isSupportedDeviceProvisioningKey, normalizeDeviceActivationKey } from "../../../shared/deviceKey";

const copy = {
  en: { title: "Activate this device", description: "Enter the Secret Key created by your MORROW administrator.", label: "Secret Key", placeholder: "MORROW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", connect: "Activate device", show: "Show key", hide: "Hide key", retry: "Retry", clear: "Clear setup", info: "Show device information", connected: "Configuring this device", invalid_request: ["This device key is invalid.", "Enter the complete key exactly as provided."], invalid_key: ["This device key is invalid.", "Check the key and try again."], network_error: ["Unable to connect.", "Check the network and try again."], timeout: ["Unable to connect.", "Check the network and try again."], disabled: ["This device is disabled.", "Contact your administrator."], expired: ["This device key has expired.", "Ask your administrator for a new key."], revoked: ["This device key has been revoked.", "Ask your administrator for a new key."], already_used: ["This device key has already been used.", "Ask your administrator for a new key."], conflict: ["This device key has already been used.", "Ask your administrator for a new key."], server_error: ["Unable to connect.", "Check the network and try again."], protocol_error: ["Setup could not be completed.", "Retry or contact your administrator."], configuration_error: ["Setup could not be completed.", "The device configuration is incomplete."] },
  tr: { title: "Bu cihazı etkinleştirin", description: "MORROW yöneticinizin oluşturduğu Gizli Anahtarı girin.", label: "Gizli Anahtar", placeholder: "MORROW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", connect: "Cihazı etkinleştir", show: "Anahtarı göster", hide: "Anahtarı gizle", retry: "Tekrar dene", clear: "Kurulumu temizle", info: "Cihaz bilgilerini göster", connected: "Bu cihaz yapılandırılıyor", invalid_request: ["Bu cihaz anahtarı geçersiz.", "Anahtarın tamamını verildiği gibi girin."], invalid_key: ["Bu cihaz anahtarı geçersiz.", "Anahtarı kontrol edip tekrar deneyin."], network_error: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."], timeout: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."], disabled: ["Bu cihaz devre dışı.", "Yöneticinizle iletişime geçin."], expired: ["Bu cihaz anahtarının süresi dolmuş.", "Yöneticinizden yeni bir anahtar isteyin."], revoked: ["Bu cihaz anahtarı iptal edilmiş.", "Yöneticinizden yeni bir anahtar isteyin."], already_used: ["Bu cihaz anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir anahtar isteyin."], conflict: ["Bu cihaz anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir anahtar isteyin."], server_error: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."], protocol_error: ["Kurulum tamamlanamadı.", "Tekrar deneyin veya yöneticinize başvurun."], configuration_error: ["Kurulum tamamlanamadı.", "Cihaz yapılandırması eksik."] },
} as const;

type SetupLanguage = SupportedLanguage;
type ErrorStatus = Exclude<DeviceStatus, "checking" | "unconfigured" | "connecting" | "configured">;
const errorStatuses: ErrorStatus[] = ["invalid_request", "invalid_key", "network_error", "timeout", "disabled", "expired", "revoked", "already_used", "conflict", "server_error", "protocol_error", "configuration_error"];
const setupSteps = ["Verifying device", "Loading branch settings", "Loading menu", "Preparing workspace"];

export default function DeviceSetup({ onConfigured, onDeviceInfo }: { onConfigured: () => void; onDeviceInfo: () => void }) {
  const { status, initializationStatus, config, configureDevice, clearDeviceConfiguration } = useDevice();
  const [language, setLanguage] = useState<SetupLanguage>("en");
  const [secretKey, setSecretKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [validationError, setValidationError] = useState("");
  const text = copy[language];
  const error = errorStatuses.includes(status as ErrorStatus) ? text[status as ErrorStatus] : null;
  const displayedError = validationError ? ["This device key is invalid.", validationError] as const : error;

  useEffect(() => {
    if (status !== "configured" || !config) return;
    const timer = window.setTimeout(onConfigured, 2600);
    return () => window.clearTimeout(timer);
  }, [config, onConfigured, status]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (initializationStatus === "registering") return;
    const trimmed = secretKey.trim();
    if (!isSupportedDeviceProvisioningKey(trimmed)) {
      setValidationError("Enter the complete MORROW device key exactly as provided.");
      return;
    }
    setValidationError("");
    const success = await configureDevice(trimmed);
    setSecretKey("");
    setVisible(false);
    if (!success) return;
  };

  return <main dir="ltr" className="min-h-[100dvh] bg-[#080b08] px-5 py-8 font-['DM_Sans'] text-white sm:px-10">
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between"><MorrowLogo variant="full" priority className="h-auto w-44" /><div className="flex gap-1">{SUPPORTED_LANGUAGE_CODES.map(item => <button type="button" key={item} onClick={() => setLanguage(item)} className={`min-h-10 rounded-xl px-3 text-xs font-bold uppercase ${language === item ? "bg-[#D7FB69] text-[#17200f]" : "bg-white/5 text-white/45"}`}>{item}</button>)}</div></header>
      <section className="my-auto rounded-[2rem] border border-white/10 bg-white/[.035] p-[clamp(1.5rem,5vw,3rem)] shadow-2xl">
        {status === "configured" && config ? <div className="text-center"><CheckCircle2 className="mx-auto size-16 text-[#D7FB69]" /><h1 className="mt-6 text-3xl font-bold">{text.connected}</h1><p className="mt-3 text-white/45">{config.kioskName} · {config.branchName}</p><div className="mx-auto mt-7 max-w-sm space-y-3 text-left">{setupSteps.map((step, index) => <div key={step} className="flex items-center gap-3 rounded-xl bg-white/[.035] px-4 py-3 text-sm text-white/70"><span className="grid size-6 place-items-center rounded-full bg-[#D7FB69]/15 text-xs font-bold text-[#D7FB69]">{index + 1}</span>{step}</div>)}</div></div> : <>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.3em] text-[#D7FB69]">Device provisioning</p><h1 className="mt-4 text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-[-.05em]">{text.title}</h1><p className="mt-3 text-white/50">{text.description}</p>
          <form onSubmit={submit} className="mt-8"><label className="text-sm font-semibold text-white/70">{text.label}<div className="relative mt-2"><input type={visible ? "text" : "password"} value={secretKey} onChange={event => { const value = event.target.value; setSecretKey(/^\s*morrow/i.test(value) ? normalizeDeviceActivationKey(value) : value); }} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder={text.placeholder} aria-describedby="device-key-help" className="min-h-16 w-full rounded-2xl border border-white/12 bg-black/25 px-5 pe-28 font-mono text-base uppercase tracking-[.08em] outline-none focus:border-[#D7FB69]/60 sm:text-lg" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute end-3 top-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs text-white/55">{visible ? <EyeOff size={17}/> : <Eye size={17}/>} {visible ? text.hide : text.show}</button></div><span id="device-key-help" className="mt-2 block text-xs font-normal text-white/35">Paste is supported. The key is removed after activation.</span></label>
            {displayedError && <div role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-red-300" size={20}/><div><strong>{displayedError[0]}</strong><p className="mt-1 text-sm text-white/55">{displayedError[1]}</p></div></div></div>}
            <button type="submit" disabled={initializationStatus === "registering"} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#D7FB69] text-lg font-bold text-[#17200f] disabled:opacity-50">{initializationStatus === "registering" ? <Loader2 className="animate-spin"/> : error ? <RotateCcw/> : null}{error ? text.retry : text.connect}</button>
          </form>
        </>}
      </section>
      <footer className="flex flex-wrap justify-center gap-2 text-xs text-white/40">{config && <button onClick={onDeviceInfo} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/5 px-4"><Info size={15}/>{text.info}</button>}<button onClick={() => { void clearDeviceConfiguration(); setSecretKey(""); }} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/5 px-4"><Trash2 size={15}/>{text.clear}</button></footer>
    </div>
  </main>;
}
