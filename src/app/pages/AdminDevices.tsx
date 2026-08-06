import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import type { DeviceManagementSnapshot, ManagedDevice, SafeActivationKey } from "../../shared/deviceManagement";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { adminDeviceManagementService } from "../services/device/adminDeviceManagementService";
import { isStaffApiError, type StaffApiFailureKind } from "../services/staffApiClient";

const field = "mt-2 min-h-12 w-full rounded-2xl border border-white/[.08] bg-black/20 px-4 text-sm text-white outline-none transition focus:border-[#C41E19]/45 focus:ring-2 focus:ring-[#C41E19]/10";
const secondaryButton = "min-h-10 rounded-xl border border-white/[.08] bg-white/[.035] px-3.5 text-xs font-bold text-white/60 transition hover:border-white/15 hover:bg-white/[.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
const surface = "rounded-[24px] border border-white/[.065] bg-white/[.022] shadow-[0_18px_60px_rgba(0,0,0,.14)]";

type VisibleKey = { keyId: string; value: string };

export default function AdminDevices() {
  const [data, setData] = useState<DeviceManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<StaffApiFailureKind | "">("");
  const [visibleKey, setVisibleKey] = useState<VisibleKey | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [deviceName, setDeviceName] = useState("New device");
  const [policy, setPolicy] = useState<"one_time" | "reusable">("one_time");
  const [maxActivations, setMaxActivations] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [clock, setClock] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await adminDeviceManagementService.snapshot();
      setData(next);
      setError("");
      setErrorKind("");
      setBranchId(current => current || next.branches.find(branch => branch.active)?.id || "");
    } catch (caught) {
      const failure = deviceFailure(caught);
      if (failure.kind === "unauthenticated" || failure.kind === "forbidden") setData(null);
      setError(failure.message);
      setErrorKind(failure.kind);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const branchNames = useMemo(
    () => new Map(data?.branches.map(branch => [branch.id, branch.name]) ?? []),
    [data],
  );
  const detailsDevice = useMemo(
    () => data?.devices.find(device => device.id === detailsId) ?? null,
    [data, detailsId],
  );

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    try {
      const created = await adminDeviceManagementService.createKey({
        branchId,
        deviceName,
        activationPolicy: policy,
        maxActivations: policy === "one_time" ? 1 : maxActivations,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setVisibleKey({ keyId: created.key.id, value: created.secretKey });
      await load();
    } catch (caught) {
      if (isStaffApiError(caught) && (caught.kind === "unauthenticated" || caught.kind === "forbidden")) setData(null);
      toast.error(message(caught));
    } finally {
      setBusy("");
    }
  };

  const perform = async (id: string, operation: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await operation();
      toast.success(success);
      await load();
    } catch (caught) {
      if (isStaffApiError(caught) && (caught.kind === "unauthenticated" || caught.kind === "forbidden")) setData(null);
      toast.error(message(caught));
    } finally {
      setBusy("");
    }
  };

  const copyVisibleKey = async () => {
    if (!visibleKey) return;
    try {
      await navigator.clipboard.writeText(visibleKey.value);
      toast.success("Activation key copied.");
    } catch {
      toast.error("The key could not be copied. Select and copy it manually.");
    }
  };

  return <>
    <header className="mb-9 flex flex-wrap items-end gap-4">
      <div>
        <h1 className="text-[1.75rem] font-black tracking-[-.04em] text-white">Devices</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">Set up a new screen or terminal, then see which devices are ready to use.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className={`${secondaryButton} ml-auto`}>
        <RefreshCw className={`me-2 inline ${loading ? "animate-spin" : ""}`} size={14}/>Refresh
      </button>
    </header>

    {error && <div role="alert" className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${errorKind === "forbidden" ? "border-amber-300/20 bg-amber-300/[.07] text-amber-100" : errorKind === "network" ? "border-sky-300/15 bg-sky-300/[.06] text-sky-100" : "border-red-400/15 bg-red-400/[.07] text-red-200"}`}>{error}</div>}

    <section className={`${surface} p-5 sm:p-7`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#C41E19]/10 text-[#C41E19]"><KeyRound size={18}/></span>
        <div><h2 className="font-bold text-white">Create activation key</h2><p className="mt-1 text-sm text-white/35">The device chooses its workspace after the key is verified.</p></div>
      </div>

      <form onSubmit={create} className="mt-7">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-xs font-semibold text-white/45">Branch
            <select required value={branchId} onChange={event => setBranchId(event.target.value)} className={field}>
              {data?.branches.filter(branch => branch.active).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-white/45">Default device name
            <input required maxLength={120} value={deviceName} onChange={event => setDeviceName(event.target.value)} className={field}/>
            <span className="mt-1.5 block text-[11px] font-normal text-white/25">You can rename the device later.</span>
          </label>
        </div>

        <div className="mt-6 border-t border-white/[.055] pt-5">
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(open => !open)} className="flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-white/45 transition hover:text-white/75">
            <ChevronDown size={16} className={`transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`}/>
            Advanced options
          </button>
          {advancedOpen && <div className="mt-4 grid gap-5 rounded-2xl border border-white/[.055] bg-black/10 p-5 md:grid-cols-3">
            <label className="text-xs font-semibold text-white/45">Activation policy
              <select value={policy} onChange={event => setPolicy(event.target.value as "one_time" | "reusable")} className={field}>
                <option value="one_time">One-time</option><option value="reusable">Reusable</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-white/45">Maximum activations
              <input type="number" min={1} max={1000} disabled={policy === "one_time"} value={policy === "one_time" ? 1 : maxActivations} onChange={event => setMaxActivations(Number(event.target.value))} className={`${field} disabled:cursor-not-allowed disabled:opacity-35`}/>
            </label>
            <label className="text-xs font-semibold text-white/45">Expiration date
              <input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className={field}/>
            </label>
          </div>}
        </div>

        <button disabled={busy === "create" || !branchId} className="mt-6 min-h-12 rounded-2xl bg-[#C41E19] px-6 text-sm font-black text-[#FFFFFF] shadow-[0_8px_30px_rgba(215,251,105,.12)] transition hover:bg-[#e0ff82] disabled:cursor-not-allowed disabled:opacity-40">
          {busy === "create" ? <Loader2 className="me-2 inline animate-spin" size={16}/> : <KeyRound className="me-2 inline" size={16}/>}Create activation key
        </button>
      </form>
    </section>

    <section className="mt-9">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-white">Activation keys</h2><p className="mt-1 text-xs text-white/30">Keys waiting to be used on a device.</p></div></div>
      {loading && !data ? <LoadingCard/> : data?.keys.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.keys.map(key => <ActivationKeyCard key={key.id} activationKey={key} branch={branchNames.get(key.branchId) ?? "Unknown branch"} visibleValue={visibleKey?.keyId === key.id ? visibleKey.value : null} busy={busy === key.id} onCopy={() => void copyVisibleKey()} onRevoke={() => {
          if (window.confirm(`Revoke the activation key for ${key.deviceName}? It cannot be used again.`)) void perform(key.id, () => adminDeviceManagementService.revokeKey(key.id), "Activation key revoked.");
        }}/>)}</div> : <EmptyCard icon={<KeyRound size={20}/>} title="No activation keys" description="Create a key when you are ready to set up a new device."/>}
    </section>

    <section className="mt-10">
      <div className="mb-4"><h2 className="font-bold text-white">Devices</h2><p className="mt-1 text-xs text-white/30">Select a device to view more details.</p></div>
      {loading && !data ? <LoadingCard/> : data?.devices.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.devices.map(device => <DeviceCard key={device.id} device={device} now={clock} busy={busy === device.id} onOpen={() => setDetailsId(device.id)} perform={perform}/>)}</div> : <EmptyCard icon={<Wifi size={20}/>} title="No devices yet" description="Activated devices will appear here."/>}
    </section>

    {visibleKey && <ActivationKeyModal value={visibleKey.value} onCopy={() => void copyVisibleKey()} onDone={() => setVisibleKey(null)}/>}
    <DeviceDetails open={Boolean(detailsDevice)} device={detailsDevice} branch={detailsDevice ? branchNames.get(detailsDevice.branchId) ?? "Unknown branch" : ""} now={clock} onOpenChange={open => { if (!open) setDetailsId(null); }}/>
  </>;
}

function ActivationKeyCard({ activationKey, branch, visibleValue, busy, onCopy, onRevoke }: {
  activationKey: SafeActivationKey;
  branch: string;
  visibleValue: string | null;
  busy: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  return <article className={`${surface} flex min-h-44 flex-col p-5`}>
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[.045] text-white/40"><KeyRound size={16}/></span><div className="min-w-0"><h3 className="truncate font-bold text-white">{activationKey.deviceName}</h3><p className="mt-1 font-mono text-xs tracking-[.12em] text-white/35">•••• {activationKey.keyHint}</p></div><StatusPill status={activationKey.status}/></div>
    <div className="mt-5 space-y-1 text-sm text-white/40"><p>{branch}</p><p>{activationKey.deviceType ? label(activationKey.deviceType) : "Workspace selected on device"}</p>{activationKey.expiresAt && <p>Expires {formatDate(activationKey.expiresAt)}</p>}</div>
    <div className="mt-auto flex gap-2 pt-5">{visibleValue && <button type="button" onClick={onCopy} className={secondaryButton}><Copy className="me-1.5 inline" size={13}/>Copy</button>}{activationKey.status === "active" && <button type="button" disabled={busy} onClick={onRevoke} className={`${secondaryButton} text-red-300/80 hover:text-red-200`}><ShieldOff className="me-1.5 inline" size={13}/>Revoke</button>}</div>
  </article>;
}

function DeviceCard({ device, now, busy, onOpen, perform }: {
  device: ManagedDevice;
  now: number;
  busy: boolean;
  onOpen: () => void;
  perform: (id: string, operation: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const online = isOnline(device, now);
  const rename = () => {
    const name = window.prompt("New device name", device.name)?.trim();
    if (name && name !== device.name) void perform(device.id, () => adminDeviceManagementService.updateDevice(device.id, { name }), "Device renamed.");
  };
  const toggle = () => {
    const next = device.status === "active" ? "disabled" : "active";
    if (window.confirm(`${next === "disabled" ? "Disable" : "Enable"} ${device.name}?`)) void perform(device.id, () => adminDeviceManagementService.updateDevice(device.id, { status: next }), `Device ${next}.`);
  };
  const revokeSession = () => {
    if (window.confirm(`Revoke the current session for ${device.name}? The device will need to sign in again.`)) void perform(device.id, () => adminDeviceManagementService.revokeSessions(device.id), "Device session revoked.");
  };
  const deleteDevice = () => {
    if (window.confirm(`Delete ${device.name} from active use? This permanently revokes the device while retaining its protected audit record.`)) void perform(device.id, () => adminDeviceManagementService.updateDevice(device.id, { status: "revoked" }), "Device deleted from active use.");
  };
  const stopCardClick = (event: MouseEvent) => event.stopPropagation();

  return <article role="button" tabIndex={0} aria-label={`View details for ${device.name}`} onClick={onOpen} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }} className={`${surface} group cursor-pointer p-5 outline-none transition hover:-translate-y-0.5 hover:border-white/[.11] hover:bg-white/[.035] focus-visible:ring-2 focus-visible:ring-[#C41E19]/35`}>
    <div className="flex items-start gap-3"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.45)]" : "bg-white/20"}`}/><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-white">{device.name}</h3><p className="mt-1 text-sm capitalize text-white/40">{label(device.deviceType)}</p></div>
      <div onClick={stopCardClick}>
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${device.name}`} disabled={busy} className="grid size-9 place-items-center rounded-xl text-white/35 transition hover:bg-white/[.07] hover:text-white disabled:opacity-40"><MoreHorizontal size={18}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-2xl border-white/10 bg-[#151915] p-1.5 text-white shadow-2xl">
          <DropdownMenuItem onSelect={rename} className="min-h-10 rounded-xl text-white/70 focus:bg-white/[.07] focus:text-white"><Pencil/>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void perform(device.id, () => adminDeviceManagementService.refreshConfiguration(device.id), "Configuration refresh requested.")} className="min-h-10 rounded-xl text-white/70 focus:bg-white/[.07] focus:text-white"><RotateCcw/>Refresh configuration</DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle} className="min-h-10 rounded-xl text-white/70 focus:bg-white/[.07] focus:text-white"><Power/>{device.status === "active" ? "Disable" : "Enable"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={revokeSession} className="min-h-10 rounded-xl text-white/70 focus:bg-white/[.07] focus:text-white"><ShieldOff/>Revoke session</DropdownMenuItem>
          <DropdownMenuSeparator className="my-1 bg-white/[.07]"/>
          <DropdownMenuItem disabled={device.status === "revoked"} onSelect={deleteDevice} className="min-h-10 rounded-xl text-red-300 focus:bg-red-400/10 focus:text-red-200"><Trash2/>Delete device</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>
    </div>
    <div className="mt-8 flex items-end justify-between gap-3"><div><p className={`flex items-center gap-1.5 text-sm font-semibold ${online ? "text-emerald-300" : "text-white/35"}`}>{online ? <Wifi size={14}/> : <WifiOff size={14}/>}{online ? "Online" : "Offline"}</p><p className="mt-2 text-xs text-white/30">Last active {relativeTime(device.lastSeenAt, now)}</p></div><span className="text-xs text-white/20 transition group-hover:text-white/35">View details</span></div>
  </article>;
}

function ActivationKeyModal({ value, onCopy, onDone }: { value: string; onCopy: () => void; onDone: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onDone(); }}>
    <DialogContent className="max-w-lg gap-0 rounded-[28px] border-[#C41E19]/20 bg-[#111510] p-6 text-white shadow-[0_30px_100px_rgba(0,0,0,.6)] sm:p-8 [&>button.absolute]:hidden">
      <span className="grid size-12 place-items-center rounded-2xl bg-[#C41E19]/10 text-[#C41E19]"><KeyRound size={21}/></span>
      <DialogTitle className="mt-6 text-2xl font-black tracking-[-.035em] text-white">Activation Key Created</DialogTitle>
      <DialogDescription className="mt-3 whitespace-pre-line text-sm leading-6 text-white/50">{"This key will only be shown once.\nCopy it before closing."}</DialogDescription>
      <div className="mt-6 select-all break-all rounded-2xl border border-white/[.08] bg-black/25 p-5 text-center font-mono text-base font-bold leading-7 tracking-[.09em] text-[#C41E19] sm:text-lg">{value}</div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onCopy} className="min-h-12 rounded-2xl bg-[#C41E19] font-black text-[#FFFFFF]"><Copy className="me-2 inline" size={16}/>Copy Key</button><DialogClose asChild><button type="button" className={secondaryButton}>Done</button></DialogClose></div>
    </DialogContent>
  </Dialog>;
}

function DeviceDetails({ open, device, branch, now, onOpenChange }: { open: boolean; device: ManagedDevice | null; branch: string; now: number; onOpenChange: (open: boolean) => void }) {
  if (!device) return null;
  const online = isOnline(device, now);
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-[min(92vw,520px)] border-white/[.08] bg-[#0d100d] p-0 text-white sm:max-w-[520px]">
    <SheetHeader className="border-b border-white/[.06] px-6 py-7"><SheetTitle className="pe-8 text-xl font-black tracking-[-.03em] text-white">{device.name}</SheetTitle><SheetDescription className="flex items-center gap-2 text-white/40"><span className={`size-2 rounded-full ${online ? "bg-emerald-400" : "bg-white/20"}`}/>{label(device.deviceType)} · {online ? "Online" : "Offline"}</SheetDescription></SheetHeader>
    <div className="overflow-y-auto px-6 pb-10">
      <DetailsSection title="Device details"><Detail label="Branch" value={branch}/><Detail label="Device ID" value={device.id} mono/><Detail label="Configuration version" value={String(device.configVersion)}/></DetailsSection>
      <DetailsSection title="Activity"><Detail label="Activated" value={device.activatedAt ? formatDate(device.activatedAt) : "Not available"}/><Detail label="Last heartbeat" value={device.lastSeenAt ? `${formatDate(device.lastSeenAt)} (${relativeTime(device.lastSeenAt, now)})` : "No heartbeat received"}/><Detail label="Activation history" value={device.activatedAt ? `Activated ${formatDate(device.activatedAt)}` : "No activation event available"}/></DetailsSection>
      <DetailsSection title="Session information"><Detail label="Session" value={device.status === "revoked" ? "Revoked" : device.status === "disabled" ? "Device disabled" : "Managed securely"}/><p className="mt-3 text-xs leading-5 text-white/30">Session secrets are protected and are never displayed in the admin interface.</p></DetailsSection>
      <DetailsSection title="Backend metadata"><Detail label="App version" value={device.appVersion ?? "Not reported"}/><Detail label="Connection health" value={label(device.connectionHealth)}/><Detail label="Lifecycle status" value={label(device.status)}/></DetailsSection>
      <DetailsSection title="Audit events"><p className="text-sm leading-6 text-white/40">Audit events are retained by the secure device service. Event payloads are not included in the current admin snapshot.</p></DetailsSection>
    </div>
  </SheetContent></Sheet>;
}

function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b border-white/[.055] py-6 last:border-0"><h3 className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-white/25">{title}</h3><div className="space-y-4">{children}</div></section>;
}

function Detail({ label: detailLabel, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-5"><span className="text-sm text-white/35">{detailLabel}</span><strong className={`max-w-[65%] break-words text-right text-sm font-semibold capitalize text-white/70 ${mono ? "font-mono text-xs normal-case" : ""}`}>{value}</strong></div>;
}

function StatusPill({ status }: { status: SafeActivationKey["status"] }) {
  const active = status === "active";
  return <span className={`ml-auto rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize ${active ? "border-emerald-400/15 bg-emerald-400/[.08] text-emerald-300" : status === "revoked" ? "border-red-400/15 bg-red-400/[.07] text-red-300" : "border-white/[.07] bg-white/[.035] text-white/35"}`}>{status}</span>;
}

function EmptyCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className={`${surface} flex min-h-36 items-center justify-center p-6 text-center`}><div><span className="mx-auto grid size-10 place-items-center rounded-2xl bg-white/[.04] text-white/25">{icon}</span><h3 className="mt-4 text-sm font-bold text-white/60">{title}</h3><p className="mt-1 text-xs text-white/30">{description}</p></div></div>;
}

function LoadingCard() {
  return <div className={`${surface} grid min-h-36 place-items-center`}><Loader2 className="animate-spin text-[#C41E19]" size={20}/></div>;
}

function isOnline(device: ManagedDevice, now: number) {
  if (device.status !== "active" || device.connectionHealth === "offline") return false;
  if (!device.lastSeenAt) return device.connectionHealth === "online";
  return now - Date.parse(device.lastSeenAt) < 5 * 60_000;
}

function relativeTime(value: string | null, now: number) {
  if (!value) return "never";
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function label(value: string) { return value.replace(/_/g, " "); }
function message(error: unknown) { return error instanceof Error ? error.message : "Device management request failed."; }
function deviceFailure(error: unknown): { kind: StaffApiFailureKind; message: string } {
  if (!isStaffApiError(error)) return { kind: "server", message: message(error) };
  if (error.kind === "forbidden") return { kind: error.kind, message: `Permission denied. ${error.message}` };
  return { kind: error.kind, message: error.message };
}
