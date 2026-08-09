import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, RotateCcw, Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import type { BootstrapDeviceType, DeviceActivationKeyVerificationResponse } from "../../../shared/deviceBootstrap";
import { isDeviceActivationKey, isSupportedDeviceProvisioningKey, normalizeDeviceActivationKey } from "../../../shared/deviceKey";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from "../../config/languages";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";
import type { DeviceStatus } from "../../types/device";
import DeviceWorkspaceStage, { workspaceDefinitions, workspaceLayoutId } from "./DeviceWorkspaceStage";
import "./DeviceSetup.css";

const copy = {
  en: { title: "Activate this device", description: "Enter the Secret Key created by your cangujet administrator.", label: "Secret Key", placeholder: "MORROW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", show: "Show key", hide: "Hide key", retry: "Retry", clear: "Clear setup", info: "Show device information", connected: "Configuring this device", invalid_request: ["This device key is invalid.", "Enter the complete key exactly as provided."], invalid_key: ["This device key is invalid.", "Check the key and try again."], network_error: ["Unable to connect.", "Check the network and try again."], timeout: ["Unable to connect.", "Check the network and try again."], session_expired: ["This device needs to be activated again.", "Enter a new activation key to continue."], disabled: ["This device is disabled.", "Contact your administrator."], expired: ["This device key has expired.", "Ask your administrator for a new key."], revoked: ["This device key has been revoked.", "Ask your administrator for a new key."], already_used: ["This device key has already been used.", "Ask your administrator for a new key."], conflict: ["This device key has already been used.", "Ask your administrator for a new key."], server_error: ["The device service is temporarily unavailable.", "Try again in a moment. If the problem continues, contact your administrator."], protocol_error: ["Setup could not be completed.", "Retry or contact your administrator."], configuration_error: ["Setup could not be completed.", "The device configuration is incomplete."] },
  tr: { title: "Bu cihazı etkinleştirin", description: "MORROW yöneticinizin oluşturduğu Gizli Anahtarı girin.", label: "Gizli Anahtar", placeholder: "MORROW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", show: "Anahtarı göster", hide: "Anahtarı gizle", retry: "Tekrar dene", clear: "Kurulumu temizle", info: "Cihaz bilgilerini göster", connected: "Bu cihaz yapılandırılıyor", invalid_request: ["Bu cihaz anahtarı geçersiz.", "Anahtarın tamamını verildiği gibi girin."], invalid_key: ["Bu cihaz anahtarı geçersiz.", "Anahtarı kontrol edip tekrar deneyin."], network_error: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."], timeout: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."], session_expired: ["Bu cihazın yeniden etkinleştirilmesi gerekiyor.", "Devam etmek için yeni bir etkinleştirme anahtarı girin."], disabled: ["Bu cihaz devre dışı.", "Yöneticinizle iletişime geçin."], expired: ["Bu cihaz anahtarının süresi dolmuş.", "Yöneticinizden yeni bir anahtar isteyin."], revoked: ["Bu cihaz anahtarı iptal edilmiş.", "Yöneticinizden yeni bir anahtar isteyin."], already_used: ["Bu cihaz anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir anahtar isteyin."], conflict: ["Bu cihaz anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir anahtar isteyin."], server_error: ["Cihaz hizmeti geçici olarak kullanılamıyor.", "Biraz sonra tekrar deneyin; sorun sürerse yöneticinize başvurun."], protocol_error: ["Kurulum tamamlanamadı.", "Tekrar deneyin veya yöneticinize başvurun."], configuration_error: ["Kurulum tamamlanamadı.", "Cihaz yapılandırması eksik."] },
} as const;

type SetupLanguage = SupportedLanguage;
type ErrorStatus = Exclude<DeviceStatus, "checking" | "unconfigured" | "connecting" | "configured">;
const errorStatuses: ErrorStatus[] = ["invalid_request", "invalid_key", "network_error", "timeout", "session_expired", "disabled", "expired", "revoked", "already_used", "conflict", "server_error", "protocol_error", "configuration_error"];
const setupSteps = ["Verifying device", "Loading branch settings", "Loading menu", "Preparing workspace"];
type DeviceSetupProps = {
  onConfigured: () => void;
  onDeviceInfo: () => void;
  workspaceSelection?: boolean;
  onWorkspaceSelected?: (type: BootstrapDeviceType) => void;
};

export default function DeviceSetup({ onConfigured, onDeviceInfo, workspaceSelection = false, onWorkspaceSelected }: DeviceSetupProps) {
  const { status, initializationStatus, config, verifyActivationKey, configureDevice, clearDeviceConfiguration } = useDevice();
  const [language, setLanguage] = useState<SetupLanguage>("en");
  const [secretKey, setSecretKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [verifiedKey, setVerifiedKey] = useState<DeviceActivationKeyVerificationResponse | null>(null);
  const [selectedType, setSelectedType] = useState<BootstrapDeviceType | null>(null);
  const text = copy[language];
  const error = errorStatuses.includes(status as ErrorStatus) ? text[status as ErrorStatus] : null;
  const displayedError = validationError ? ["This device key is invalid.", validationError] as const : error;
  const provisionedVerification: DeviceActivationKeyVerificationResponse | null = workspaceSelection && config ? {
    restaurant: { name: config.restaurantName },
    branch: { name: config.branchName },
    allowedDeviceTypes: workspaceDefinitions.map(workspace => workspace.type),
  } : null;
  const stageVerification = provisionedVerification ?? verifiedKey;

  useEffect(() => {
    if (workspaceSelection || status !== "configured" || !config) return;
    const timer = window.setTimeout(onConfigured, 2600);
    return () => window.clearTimeout(timer);
  }, [config, onConfigured, status, workspaceSelection]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (initializationStatus === "registering" || status === "connecting") return;
    const trimmed = secretKey.trim();
    if (!isSupportedDeviceProvisioningKey(trimmed)) {
      setValidationError("Enter the complete cangujet device key exactly as provided.");
      return;
    }
    setValidationError("");
    if (!isDeviceActivationKey(trimmed)) {
      const success = await configureDevice(trimmed, "kiosk");
      if (success) { setSecretKey(""); setVisible(false); }
      return;
    }
    const verified = await verifyActivationKey(trimmed);
    if (!verified) return;
    setVerifiedKey(verified);
    setSelectedType(null);
  };

  const activate = async (deviceType: BootstrapDeviceType) => {
    if (workspaceSelection && config) {
      onWorkspaceSelected?.(deviceType);
      return;
    }
    if (initializationStatus === "registering") return;
    setSelectedType(deviceType);
    const success = await configureDevice(secretKey.trim(), deviceType);
    if (!success) { setSelectedType(null); return; }
    setSecretKey("");
    setVisible(false);
  };

  const resetVerification = () => {
    setVerifiedKey(null);
    setSelectedType(null);
    setValidationError("");
  };

  const workspaceMode = Boolean(stageVerification && (workspaceSelection || status !== "configured"));

  return <main dir="ltr" className={`device-setup-page ${workspaceMode ? "device-setup-page--workspace" : ""} min-h-[100dvh] bg-[#F8F9FA] px-5 py-8 text-[#1F1F1F] sm:px-10`}>
    <div className={`device-setup-shell mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col ${workspaceMode ? "max-w-[1180px]" : "max-w-2xl"}`}>
      {!workspaceMode && <header className="device-setup-header flex items-center justify-between"><MorrowLogo variant="full" priority className="h-auto w-44" /><div className="device-setup-languages flex gap-1 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] p-1 shadow-[0_3px_10px_rgba(31,31,31,.04)]">{SUPPORTED_LANGUAGE_CODES.map(item => <button type="button" key={item} onClick={() => setLanguage(item)} className={`min-h-10 rounded-lg px-3 text-xs font-bold uppercase transition active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19] ${language === item ? "bg-[#C41E19] text-[#FFFFFF] shadow-[0_4px_12px_rgba(196,30,25,.16)]" : "text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"}`}>{item}</button>)}</div></header>}
      <section className={workspaceMode ? "device-workspace-stage" : "my-auto rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-[clamp(1.5rem,5vw,3rem)] shadow-[0_10px_30px_rgba(31,31,31,.07)] transition duration-300 hover:shadow-[0_14px_36px_rgba(31,31,31,.09)]"}>
        {!workspaceSelection && status === "configured" && config ? <ConfiguredState config={config} text={text.connected} selectedType={selectedType} /> : stageVerification ? <DeviceWorkspaceStage verification={stageVerification} initialType={workspaceSelection ? config?.bootstrap.device.type : undefined} selectedType={selectedType} busy={!workspaceSelection && initializationStatus === "registering"} error={displayedError} onBack={workspaceSelection ? undefined : resetVerification} onActivate={activate} /> : <>
          <p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#C41E19]">Device provisioning</p><h1 className="mt-4 text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-[-.05em]">{text.title}</h1><p className="mt-3 text-[#6B7280]">{text.description}</p>
          <form onSubmit={submit} className="mt-8"><label className="text-sm font-semibold text-[#1F1F1F]">{text.label}<div className="relative mt-2"><input type={visible ? "text" : "password"} value={secretKey} onChange={event => { const value = event.target.value; setSecretKey(/^\s*morrow/i.test(value) ? normalizeDeviceActivationKey(value) : value); }} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder={text.placeholder} aria-describedby="device-key-help" className="min-h-16 w-full rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-5 pe-28 text-base uppercase tracking-[.08em] text-[#1F1F1F] outline-none transition placeholder:text-[#9CA3AF] hover:border-[#C41E19]/25 focus:border-[#C41E19] focus:ring-4 focus:ring-[#C41E19]/10 sm:text-lg" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute end-3 top-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs text-[#6B7280] transition hover:bg-[#F8F9FA] hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]">{visible ? <EyeOff size={17}/> : <Eye size={17}/>} {visible ? text.hide : text.show}</button></div><span id="device-key-help" className="mt-2 block text-xs font-normal text-[#9CA3AF]">Paste is supported. The key is removed after activation.</span></label>
            {displayedError && <ErrorPanel error={displayedError} />}
            <button type="submit" disabled={initializationStatus === "registering" || status === "connecting"} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#C41E19] text-lg font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19] disabled:cursor-not-allowed disabled:opacity-50">{status === "connecting" ? <Loader2 className="animate-spin"/> : error ? <RotateCcw/> : null}{error ? text.retry : "Verify key"}</button>
          </form>
        </>}
      </section>
      <footer className={`device-setup-footer flex flex-wrap justify-center gap-2 text-xs text-[#6B7280] ${workspaceMode ? "device-setup-footer--workspace" : ""}`}>{config && <button onClick={onDeviceInfo} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-4 transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-[.98]"><Info size={15}/>{text.info}</button>}<button onClick={() => { void clearDeviceConfiguration(); setSecretKey(""); resetVerification(); }} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#C41E19] bg-[#FFFFFF] px-4 text-[#C41E19] transition hover:-translate-y-0.5 hover:bg-[#C41E19] hover:text-[#FFFFFF] active:scale-[.98]"><Trash2 size={15}/>{text.clear}</button></footer>
    </div>
  </main>;
}

function ConfiguredState({ config, text, selectedType }: { config: NonNullable<ReturnType<typeof useDevice>["config"]>; text: string; selectedType: BootstrapDeviceType | null }) {
  const workspace = workspaceDefinitions.find(item => item.type === selectedType);
  return <motion.div layoutId={workspaceLayoutId(workspace)} className="text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#C41E19]/10"><CheckCircle2 className="size-12 text-[#C41E19]" /></span><h1 className="mt-6 text-3xl font-bold tracking-[-.03em]">{text}</h1><p className="mt-3 text-[#6B7280]">{config.kioskName} · {config.branchName}</p><div className="mx-auto mt-7 max-w-sm space-y-3 text-left">{setupSteps.map((step, index) => <div key={step} className="flex items-center gap-3 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-4 py-3 text-sm text-[#6B7280] shadow-[0_3px_10px_rgba(31,31,31,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_7px_16px_rgba(31,31,31,.06)]"><span className="grid size-6 place-items-center rounded-full bg-[#C41E19]/10 text-xs font-bold text-[#C41E19]">{index + 1}</span>{step}</div>)}</div></motion.div>;
}

function ErrorPanel({ error }: { error: readonly [string, string] }) {
  return <div role="alert" className="mt-4 rounded-2xl border border-[#C41E19]/25 bg-[#C41E19]/5 p-4 text-[#1F1F1F]"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#C41E19]" size={20}/><div><strong>{error[0]}</strong><p className="mt-1 text-sm text-[#6B7280]">{error[1]}</p></div></div></div>;
}
