import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2,
  MonitorSmartphone, RotateCcw, ShieldCheck,
} from "lucide-react";
import type { BootstrapDeviceType, DeviceActivationKeyVerificationResponse } from "../../../shared/deviceBootstrap";
import { isDeviceActivationKey, isSupportedDeviceProvisioningKey, normalizeDeviceActivationKey } from "../../../shared/deviceKey";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from "../../config/languages";
import CangujetLogo from "../../components/branding/CangujetLogo";
import ConfigurationLoadingScreen from "../../components/configuration/ConfigurationLoadingScreen";
import PreparingDeviceScreen from "../../components/configuration/PreparingDeviceScreen";
import { useBootstrap } from "../../context/BootstrapContext";
import { useDevice } from "../../context/DeviceContext";
import type { DeviceStatus } from "../../types/device";
import DeviceWorkspaceStage, { workspaceDefinitions } from "./DeviceWorkspaceStage";
import "./DeviceSetup.css";

const PREPARING_VISUAL_THRESHOLD_MS = 150;

const copy = {
  en: {
    title: "Activate this device",
    description: "Enter the Activation Key created by your cangujet administrator.",
    label: "Activation Key",
    placeholder: "CANGUJET-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
    help: "Paste is supported. The key is removed after activation.",
    back: "Back",
    activate: "Activate device",
    show: "Show key",
    hide: "Hide key",
    retry: "Try again",
    validation: ["This activation key is invalid.", "Enter the complete activation key exactly as provided."],
    invalid_request: ["This activation key is invalid.", "Enter the complete activation key exactly as provided."],
    invalid_key: ["This activation key is invalid.", "Check the activation key and try again."],
    network_error: ["Unable to connect.", "Check the network and try again."],
    timeout: ["Unable to connect.", "Check the network and try again."],
    session_expired: ["This device needs to be reactivated.", "Enter a new activation key to continue."],
    disabled: ["This device is disabled.", "Contact your administrator."],
    expired: ["This activation key has expired.", "Ask your administrator for a new activation key."],
    revoked: ["This activation key has been revoked.", "Ask your administrator for a new activation key."],
    already_used: ["This activation key has already been used.", "Ask your administrator for a new activation key."],
    conflict: ["This activation key has already been used.", "Ask your administrator for a new activation key."],
    server_error: ["The device service is temporarily unavailable.", "Try again in a moment. If the problem continues, contact your administrator."],
    protocol_error: ["Setup could not be completed.", "Try again or contact your administrator."],
    configuration_error: ["Setup could not be completed.", "The device configuration is incomplete."],
  },
  tr: {
    title: "Bu cihazı etkinleştirin",
    description: "cangujet yöneticiniz tarafından oluşturulan Etkinleştirme Anahtarını girin.",
    label: "Etkinleştirme Anahtarı",
    placeholder: "CANGUJET-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
    help: "Anahtarı yapıştırabilirsiniz. Etkinleştirmeden sonra anahtar bu cihazdan kaldırılır.",
    back: "Geri",
    activate: "Cihazı etkinleştir",
    show: "Anahtarı göster",
    hide: "Anahtarı gizle",
    retry: "Tekrar dene",
    validation: ["Bu etkinleştirme anahtarı geçersiz.", "Etkinleştirme anahtarının tamamını size verildiği gibi girin."],
    invalid_request: ["Bu etkinleştirme anahtarı geçersiz.", "Etkinleştirme anahtarının tamamını size verildiği gibi girin."],
    invalid_key: ["Bu etkinleştirme anahtarı geçersiz.", "Etkinleştirme anahtarını kontrol edip tekrar deneyin."],
    network_error: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."],
    timeout: ["Bağlantı kurulamıyor.", "Ağı kontrol edip tekrar deneyin."],
    session_expired: ["Bu cihazın yeniden etkinleştirilmesi gerekiyor.", "Devam etmek için yeni bir etkinleştirme anahtarı girin."],
    disabled: ["Bu cihaz devre dışı.", "Yöneticinizle iletişime geçin."],
    expired: ["Bu etkinleştirme anahtarının süresi dolmuş.", "Yöneticinizden yeni bir etkinleştirme anahtarı isteyin."],
    revoked: ["Bu etkinleştirme anahtarı iptal edilmiş.", "Yöneticinizden yeni bir etkinleştirme anahtarı isteyin."],
    already_used: ["Bu etkinleştirme anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir etkinleştirme anahtarı isteyin."],
    conflict: ["Bu etkinleştirme anahtarı daha önce kullanılmış.", "Yöneticinizden yeni bir etkinleştirme anahtarı isteyin."],
    server_error: ["Cihaz hizmeti geçici olarak kullanılamıyor.", "Biraz sonra tekrar deneyin; sorun sürerse yöneticinize başvurun."],
    protocol_error: ["Kurulum tamamlanamadı.", "Tekrar deneyin veya yöneticinize başvurun."],
    configuration_error: ["Kurulum tamamlanamadı.", "Cihaz yapılandırması eksik."],
  },
} as const;

type SetupLanguage = SupportedLanguage;
type ErrorStatus = Exclude<DeviceStatus, "checking" | "unconfigured" | "connecting" | "configured">;
const errorStatuses: ErrorStatus[] = ["invalid_request", "invalid_key", "network_error", "timeout", "session_expired", "disabled", "expired", "revoked", "already_used", "conflict", "server_error", "protocol_error", "configuration_error"];
type DeviceSetupProps = {
  onConfigured: () => void;
  onStaffSignIn: () => void;
  workspaceSelection?: boolean;
  onWorkspaceSelected?: (type: BootstrapDeviceType) => void;
};

export default function DeviceSetup({ onConfigured, onStaffSignIn, workspaceSelection = false, onWorkspaceSelected }: DeviceSetupProps) {
  const { status, initializationStatus, config, verifyActivationKey, configureDevice, retryInitialization } = useDevice();
  const bootstrap = useBootstrap();
  const [setupView, setSetupView] = useState<"entry" | "activation">("entry");
  const [language, setLanguage] = useState<SetupLanguage>("en");
  const [secretKey, setSecretKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [verifiedKey, setVerifiedKey] = useState<DeviceActivationKeyVerificationResponse | null>(null);
  const [selectedType, setSelectedType] = useState<BootstrapDeviceType | null>(null);
  const [showPreparing, setShowPreparing] = useState(false);
  const text = copy[language];
  const error = errorStatuses.includes(status as ErrorStatus) ? text[status as ErrorStatus] : null;
  const displayedError = validationError ? text.validation : error;
  const provisionedVerification: DeviceActivationKeyVerificationResponse | null = workspaceSelection && config ? {
    restaurant: { name: config.restaurantName },
    branch: { name: config.branchName },
    allowedDeviceTypes: workspaceDefinitions.map(workspace => workspace.type),
  } : null;
  const stageVerification = provisionedVerification ?? verifiedKey;
  const configurationReady = bootstrap.state === "ready" || bootstrap.state === "offline";
  const preparing = !workspaceSelection && (initializationStatus === "registering" || (status === "configured" && Boolean(config) && !configurationReady && bootstrap.state !== "error"));

  useEffect(() => {
    if (workspaceSelection || status !== "configured" || !config || !configurationReady) return;
    onConfigured();
  }, [config, configurationReady, onConfigured, status, workspaceSelection]);

  useEffect(() => {
    if (!preparing) {
      setShowPreparing(false);
      return;
    }
    const timer = window.setTimeout(() => setShowPreparing(true), PREPARING_VISUAL_THRESHOLD_MS);
    return () => window.clearTimeout(timer);
  }, [preparing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (initializationStatus === "registering" || status === "connecting") return;
    const trimmed = secretKey.trim();
    if (!isSupportedDeviceProvisioningKey(trimmed)) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
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
    setValidationError(false);
  };

  const returnToEntry = () => {
    setSecretKey("");
    setVisible(false);
    resetVerification();
    setSetupView("entry");
  };

  const workspaceMode = Boolean(stageVerification && (workspaceSelection || status !== "configured"));
  const deviceStateUnavailable = !config
    && initializationStatus === "error"
    && ["network_error", "timeout", "server_error", "protocol_error", "configuration_error"].includes(status);
  const reactivationRequired = ["session_expired", "revoked", "expired"].includes(status);

  if (!workspaceSelection && status === "configured" && config && bootstrap.state === "error") {
    return <ConfigurationLoadingScreen />;
  }

  return <main dir="ltr" className={`device-setup-page ${workspaceMode ? "device-setup-page--workspace" : ""} min-h-[100dvh] bg-[#F8F9FA] px-5 py-8 text-[#1F1F1F] sm:px-10`}>
    <div className={`device-setup-shell mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col ${workspaceMode ? "max-w-[1180px]" : "max-w-2xl"}`}>
      {!workspaceMode && <header className="device-setup-header flex items-center justify-between"><CangujetLogo variant="full" priority className="h-auto w-44" /><div className="device-setup-languages flex gap-1 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] p-1 shadow-[0_3px_10px_rgba(31,31,31,.04)]">{SUPPORTED_LANGUAGE_CODES.map(item => <button type="button" key={item} onClick={() => setLanguage(item)} className={`min-h-10 rounded-lg px-3 text-xs font-bold uppercase transition active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19] ${language === item ? "bg-[#C41E19] text-[#FFFFFF] shadow-[0_4px_12px_rgba(196,30,25,.16)]" : "text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"}`}>{item}</button>)}</div></header>}
      <section className={workspaceMode ? "device-workspace-stage" : "my-auto rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-[clamp(1.5rem,5vw,3rem)] shadow-[0_10px_30px_rgba(31,31,31,.07)] transition duration-300 hover:shadow-[0_14px_36px_rgba(31,31,31,.09)]"}>
        {stageVerification ? <DeviceWorkspaceStage verification={stageVerification} initialType={workspaceSelection ? config?.bootstrap.device.type : undefined} selectedType={selectedType} busy={preparing} error={displayedError} onActivate={activate} /> : deviceStateUnavailable ? <DeviceStateUnavailable onRetry={retryInitialization} onStaffSignIn={onStaffSignIn} /> : setupView === "entry" ? <FirstRunEntry reactivationRequired={reactivationRequired} onSetUp={() => setSetupView("activation")} onStaffSignIn={onStaffSignIn} /> : <>
          <button type="button" onClick={returnToEntry} className="device-setup-back"><ArrowLeft size={16} /> {text.back}</button>
          <h1 className="mt-4 text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-[-.05em]">{text.title}</h1><p className="mt-3 text-[#6B7280]">{text.description}</p>
          <form onSubmit={submit} className="mt-8"><label className="text-sm font-semibold text-[#1F1F1F]">{text.label}<div className="relative mt-2"><input type={visible ? "text" : "password"} value={secretKey} onChange={event => { const value = event.target.value; setSecretKey(/^\s*(?:cangujet|morrow)/i.test(value) ? normalizeDeviceActivationKey(value) : value); }} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder={text.placeholder} aria-describedby="device-key-help" className="min-h-16 w-full rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-5 pe-28 text-base uppercase tracking-[.08em] text-[#1F1F1F] outline-none transition placeholder:text-[#9CA3AF] hover:border-[#C41E19]/25 focus:border-[#C41E19] focus:ring-4 focus:ring-[#C41E19]/10 sm:text-lg" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute end-3 top-3 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs text-[#6B7280] transition hover:bg-[#F8F9FA] hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]">{visible ? <EyeOff size={17}/> : <Eye size={17}/>} {visible ? text.hide : text.show}</button></div><span id="device-key-help" className="mt-2 block text-xs font-normal text-[#9CA3AF]">{text.help}</span></label>
            {displayedError && <ErrorPanel error={displayedError} />}
            <button type="submit" disabled={initializationStatus === "registering" || status === "connecting"} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#C41E19] text-lg font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19] disabled:cursor-not-allowed disabled:opacity-50">{status === "connecting" ? <Loader2 className="animate-spin"/> : error ? <RotateCcw/> : null}{error ? text.retry : text.activate}</button>
          </form>
        </>}
      </section>
    </div>
    {showPreparing && <PreparingDeviceScreen language={language} />}
  </main>;
}

function FirstRunEntry({ reactivationRequired, onSetUp, onStaffSignIn }: { reactivationRequired: boolean; onSetUp: () => void; onStaffSignIn: () => void }) {
  return <div className="first-run-entry">
    <p className="first-run-entry__eyebrow">{reactivationRequired ? "Device setup required" : "Welcome to cangujet"}</p>
    <h1>How would you like to continue?</h1>
    <p className="first-run-entry__intro">{reactivationRequired ? "This terminal needs to be activated again before device service can resume." : "Set up this terminal for service, or sign in securely to manage your restaurant."}</p>
    <div className="first-run-entry__actions">
      <button type="button" onClick={onSetUp} className="first-run-action first-run-action--primary">
        <span className="first-run-action__icon"><MonitorSmartphone size={23} /></span>
        <span className="first-run-action__copy"><strong>{reactivationRequired ? "Set up this device again" : "Set up this device"}</strong><small>Configure this terminal using an activation key.</small></span>
        <ArrowRight className="first-run-action__arrow" size={20} />
      </button>
      <button type="button" onClick={onStaffSignIn} className="first-run-action first-run-action--secondary">
        <span className="first-run-action__icon"><ShieldCheck size={23} /></span>
        <span className="first-run-action__copy"><strong>Admin / Staff sign in</strong><small>Access restaurant management securely.</small></span>
        <ArrowRight className="first-run-action__arrow" size={20} />
      </button>
    </div>
    <p className="first-run-entry__note"><ShieldCheck size={14} /> Staff sign-in does not configure or activate this device.</p>
  </div>;
}

function DeviceStateUnavailable({ onRetry, onStaffSignIn }: { onRetry: () => void; onStaffSignIn: () => void }) {
  return <div className="device-state-unavailable" role="alert">
    <span className="device-state-unavailable__icon"><AlertTriangle size={26} /></span>
    <p className="first-run-entry__eyebrow">Connection unavailable</p>
    <h1>We couldn&apos;t check this device</h1>
    <p>The device service is temporarily unavailable. Existing device state has not been cleared or changed.</p>
    <div className="device-state-unavailable__actions">
      <button type="button" onClick={onRetry} className="device-state-retry"><RotateCcw size={17} /> Retry connection</button>
      <button type="button" onClick={onStaffSignIn} className="device-state-staff"><ShieldCheck size={17} /> Admin / Staff sign in</button>
    </div>
  </div>;
}

function ErrorPanel({ error }: { error: readonly [string, string] }) {
  return <div role="alert" className="mt-4 rounded-2xl border border-[#C41E19]/25 bg-[#C41E19]/5 p-4 text-[#1F1F1F]"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#C41E19]" size={20}/><div><strong>{error[0]}</strong><p className="mt-1 text-sm text-[#6B7280]">{error[1]}</p></div></div></div>;
}
