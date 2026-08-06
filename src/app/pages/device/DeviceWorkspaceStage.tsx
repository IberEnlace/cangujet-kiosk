import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, Check, ChefHat, CircleDollarSign, Loader2,
  MapPin, Monitor, ReceiptText, TabletSmartphone, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BootstrapDeviceType, DeviceActivationKeyVerificationResponse } from "../../../shared/deviceBootstrap";
import MorrowLogo from "../../components/branding/MorrowLogo";

export type WorkspaceDefinition = {
  type: BootstrapDeviceType;
  title: string;
  category: string;
  description: string;
  action: string;
  backgroundWord: string;
  previewId: "customer" | "kitchen" | "cashier" | "admin" | "display";
  icon: LucideIcon;
};

export const workspaceDefinitions: WorkspaceDefinition[] = [
  { type: "kiosk", title: "Customer Kiosk", category: "Guest Ordering", description: "A polished self-service journey from welcome to payment.", action: "Use as Customer Kiosk", backgroundWord: "ORDER", previewId: "customer", icon: TabletSmartphone },
  { type: "kitchen_display", title: "Kitchen", category: "Food Preparation", description: "Live tickets, clear priorities, and a focused production flow.", action: "Configure Kitchen", backgroundWord: "PREPARE", previewId: "kitchen", icon: ChefHat },
  { type: "cashier_terminal", title: "Cashier", category: "Point of Sale", description: "Fast order entry, payments, receipts, and register control.", action: "Launch Cashier", backgroundWord: "SELL", previewId: "cashier", icon: ReceiptText },
  { type: "admin_terminal", title: "Admin", category: "Management", description: "Restaurant intelligence, menus, settings, and operations.", action: "Open Admin Setup", backgroundWord: "MANAGE", previewId: "admin", icon: BarChart3 },
  { type: "order_display", title: "Order Display", category: "Pickup Screen", description: "A calm, legible view of preparing and ready orders.", action: "Configure Order Display", backgroundWord: "DISPLAY", previewId: "display", icon: Monitor },
];

const particles = [
  [8, 19, 18, 1], [17, 76, 23, 2], [29, 12, 21, 1], [41, 88, 26, 1], [54, 17, 19, 2],
  [66, 82, 25, 1], [76, 10, 22, 1], [87, 89, 28, 2], [94, 28, 20, 1], [4, 57, 24, 1],
] as const;

export function workspaceLayoutId(workspace: Pick<WorkspaceDefinition, "previewId"> | null | undefined) {
  return workspace ? `workspace-preview-${workspace.previewId}` : undefined;
}

type StageProps = {
  verification: DeviceActivationKeyVerificationResponse;
  selectedType: BootstrapDeviceType | null;
  busy: boolean;
  error: readonly [string, string] | null;
  onBack: () => void;
  onActivate: (type: BootstrapDeviceType) => Promise<void>;
};

export default function DeviceWorkspaceStage({ verification, selectedType, busy, error, onBack, onActivate }: StageProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const available = workspaceDefinitions.filter(workspace => verification.allowedDeviceTypes.includes(workspace.type));
  const [choice, setChoice] = useState<BootstrapDeviceType | null>(() => available[0]?.type ?? null);
  const [direction, setDirection] = useState(1);
  const navigationRefs = useRef<Partial<Record<BootstrapDeviceType, HTMLButtonElement | null>>>({});
  const activeType = selectedType ?? choice ?? available[0]?.type ?? null;
  const activeIndex = available.findIndex(workspace => workspace.type === activeType);
  const activeWorkspace = activeIndex >= 0 ? available[activeIndex] : null;
  const ActiveWorkspaceIcon = activeWorkspace?.icon;

  useEffect(() => {
    if (!available.length || (choice && available.some(workspace => workspace.type === choice))) return;
    setChoice(available[0].type);
  }, [available, choice]);

  const selectWorkspace = (type: BootstrapDeviceType) => {
    if (busy || type === activeType) return;
    const nextIndex = available.findIndex(workspace => workspace.type === type);
    setDirection(nextIndex >= activeIndex ? 1 : -1);
    setChoice(type);
  };

  const moveSelection = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % available.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + available.length) % available.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = available.length - 1;
    else return;
    event.preventDefault();
    const next = available[nextIndex];
    selectWorkspace(next.type);
    navigationRefs.current[next.type]?.focus();
  };

  return <motion.div className={`morrow-workspace ${busy ? "is-launching" : ""}`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? .12 : .45 }}>
    <WorkspaceEnvironment workspace={activeWorkspace} reducedMotion={reducedMotion} />

    <header className="morrow-workspace__header">
      <MorrowLogo variant="full" priority className="morrow-workspace__logo" />
      <div className="morrow-workspace__header-context">
        <span className="morrow-workspace__branch"><MapPin size={13}/>{verification.branch.name}</span>
        <span className="morrow-workspace__connected"><i/>Connected</span>
      </div>
      <ol className="morrow-workspace__steps" aria-label="Device setup progress">
        <li className="is-complete"><span>01</span><b>Verified</b></li>
        <li className="is-active" aria-current="step"><span>02</span><b>Workspace</b></li>
        <li><span>03</span><b>Configure</b></li>
      </ol>
      <button type="button" className="morrow-workspace__back" onClick={onBack} disabled={busy}><ArrowLeft size={15}/><span>Change key</span></button>
    </header>

    <div className="morrow-workspace__heading">
      <p>Workspace stage</p>
      <h1>Configure this device</h1>
      <span>Select the workspace this device will run.</span>
    </div>

    {error && <div role="alert" className="morrow-workspace__error"><strong>{error[0]}</strong><span>{error[1]}</span></div>}

    <div className="morrow-workspace__viewport">
      <AnimatePresence mode="wait" initial={false} custom={{ direction, reducedMotion }}>
        {activeWorkspace && <motion.section
          key={activeWorkspace.type}
          id={`workspace-panel-${activeWorkspace.type}`}
          role="tabpanel"
          aria-labelledby={`workspace-tab-${activeWorkspace.type}`}
          className="morrow-workspace__scene"
          custom={{ direction, reducedMotion }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reducedMotion ? .12 : .18, staggerChildren: reducedMotion ? 0 : .07, delayChildren: reducedMotion ? 0 : .13 } }}
          exit={{ opacity: 0, transition: { duration: reducedMotion ? .1 : .17, staggerChildren: reducedMotion ? 0 : .035, staggerDirection: -1 } }}
        >
          <motion.div className="morrow-workspace__copy" initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 30 * direction }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -28 * direction }} transition={{ duration: reducedMotion ? .1 : .34, ease: [0.22, 1, 0.36, 1] }}>
            <div className="morrow-workspace__workspace-icon">
              <motion.span initial={reducedMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -22 }} transition={{ duration: reducedMotion ? .1 : .35 }}>{ActiveWorkspaceIcon && <ActiveWorkspaceIcon size={31} strokeWidth={1.55}/>}</motion.span>
            </div>
            <motion.p className="morrow-workspace__category" initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? .1 : .3, delay: reducedMotion ? 0 : .08 }}>{activeWorkspace.category}</motion.p>
            <motion.h2 initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? .1 : .34, delay: reducedMotion ? 0 : .14 }}>{activeWorkspace.title}</motion.h2>
            <motion.p className="morrow-workspace__description" initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? .1 : .34, delay: reducedMotion ? 0 : .2 }}>{activeWorkspace.description}</motion.p>
            <motion.button
              type="button"
              className="morrow-workspace__primary"
              disabled={!activeWorkspace || busy}
              aria-busy={busy}
              onClick={() => void onActivate(activeWorkspace.type)}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? .1 : .34, delay: reducedMotion ? 0 : .26 }}
              whileHover={reducedMotion || busy ? undefined : { y: -2 }}
              whileTap={reducedMotion || busy ? undefined : { scale: .985 }}
            >
              <span>{busy ? "Configuring workspace…" : activeWorkspace.action}</span>
              {busy ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
            </motion.button>
          </motion.div>

          <motion.div
            className="morrow-workspace__preview-shell"
            layoutId={workspaceLayoutId(activeWorkspace)}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .94, filter: "blur(7px)" }}
            animate={{ opacity: 1, scale: busy ? 1.08 : 1, filter: "blur(0px)" }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .94, filter: "blur(7px)" }}
            transition={{ duration: reducedMotion ? .12 : .46, ease: [0.22, 1, 0.36, 1] }}
          >
            <WorkspacePreview workspace={activeWorkspace} />
          </motion.div>
        </motion.section>}
      </AnimatePresence>
    </div>

    <WorkspaceNavigation workspaces={available} activeType={activeType} busy={busy} navigationRefs={navigationRefs} onSelect={selectWorkspace} onKeyDown={moveSelection} />
  </motion.div>;
}

type NavigationProps = {
  workspaces: WorkspaceDefinition[];
  activeType: BootstrapDeviceType | null;
  busy: boolean;
  navigationRefs: MutableRefObject<Partial<Record<BootstrapDeviceType, HTMLButtonElement | null>>>;
  onSelect: (type: BootstrapDeviceType) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
};

function WorkspaceNavigation({ workspaces, activeType, busy, navigationRefs, onSelect, onKeyDown }: NavigationProps) {
  return <nav className="morrow-workspace__navigation" aria-label="Available workspaces">
    <div role="tablist" aria-orientation="horizontal">
      {workspaces.map((workspace, index) => {
        const Icon = workspace.icon;
        const selected = workspace.type === activeType;
        return <button
          key={workspace.type}
          ref={node => { navigationRefs.current[workspace.type] = node; }}
          id={`workspace-tab-${workspace.type}`}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={`workspace-panel-${workspace.type}`}
          tabIndex={selected ? 0 : -1}
          disabled={busy}
          onClick={() => onSelect(workspace.type)}
          onKeyDown={event => onKeyDown(event, index)}
          className={selected ? "is-selected" : ""}
        >
          {selected && <motion.span className="morrow-workspace__nav-pill" layoutId="workspace-navigation-pill" transition={{ type: "spring", stiffness: 360, damping: 34 }}/>}
          <span className="morrow-workspace__nav-icon"><Icon size={19} strokeWidth={1.7}/></span>
          <span>{workspace.title}</span>
          <i aria-hidden="true"/>
        </button>;
      })}
    </div>
  </nav>;
}

function WorkspaceEnvironment({ workspace, reducedMotion }: { workspace: WorkspaceDefinition | null; reducedMotion: boolean }) {
  return <div className={`morrow-workspace-environment workspace-${workspace?.previewId ?? "customer"}`} aria-hidden="true">
    <div className="morrow-workspace-environment__base"/>
    <div className="morrow-workspace-environment__grid"/>
    <AnimatePresence mode="wait" initial={false}>
      {workspace && <motion.span key={workspace.type} className="morrow-workspace-environment__word" initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 70 }} animate={{ opacity: .026, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -70 }} transition={{ duration: reducedMotion ? .1 : .55, ease: [0.22, 1, 0.36, 1] }}>{workspace.backgroundWord}</motion.span>}
    </AnimatePresence>
    <div className="morrow-workspace-environment__particles">{particles.map(([left, top, duration, size]) => <i key={`${left}-${top}`} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDuration: `${duration}s` }}/>)}</div>
  </div>;
}

function WorkspacePreview({ workspace }: { workspace: WorkspaceDefinition }) {
  switch (workspace.previewId) {
    case "customer": return <CustomerKioskPreview/>;
    case "kitchen": return <KitchenPreview/>;
    case "cashier": return <CashierPreview/>;
    case "admin": return <AdminPreview/>;
    case "display": return <OrderDisplayPreview/>;
  }
}

function PreviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return <div className="workspace-preview" aria-label={`${label} interface preview`}><div className="workspace-preview__top"><span/><span/><span/><b>{label}</b></div>{children}</div>;
}

function CustomerKioskPreview() {
  return <PreviewFrame label="Guest ordering"><div className="preview-kiosk"><div className="preview-kiosk__welcome"><small>Welcome to MORROW</small><strong>What would you like?</strong></div><div className="preview-kiosk__categories"><i>Popular</i><i>Burgers</i><i>Drinks</i></div><div className="preview-kiosk__products"><span><i/><b>Truffle Burger</b><small>$14.00</small></span><span><i/><b>Green Bowl</b><small>$11.50</small></span><span><i/><b>Cold Brew</b><small>$4.50</small></span></div><div className="preview-kiosk__cart"><span><Check size={12}/>Added to order</span><b>1 item · $14.00</b></div><div className="preview-kiosk__payment"><Check size={18}/><span>Payment approved</span></div></div></PreviewFrame>;
}

function KitchenPreview() {
  return <PreviewFrame label="Kitchen display"><div className="preview-kitchen"><div className="preview-kitchen__column"><header><span/>New <b>2</b></header><article><small>#A-104</small><strong>2× Truffle Burger</strong><span>Just now</span></article><article><small>#A-105</small><strong>1× Green Bowl</strong><span>1 min</span></article></div><div className="preview-kitchen__column is-preparing"><header><span/>Preparing <b>1</b></header><article><small>#A-102</small><strong>3 items</strong><span>06:42</span></article></div><div className="preview-kitchen__column is-ready"><header><span/>Ready <b>1</b></header><article><small>#A-099</small><strong>Ready to serve</strong><Check size={13}/></article></div><div className="preview-kitchen__steam"><i/><i/><i/></div></div></PreviewFrame>;
}

function CashierPreview() {
  return <PreviewFrame label="Point of sale"><div className="preview-cashier"><div className="preview-cashier__catalog"><small>Quick add</small><div><button>Burger</button><button>Salad</button><button>Coffee</button><button>More</button></div></div><div className="preview-cashier__order"><small>Current order</small><p><span>Truffle Burger</span><b>$14.00</b></p><p><span>Cold Brew</span><b>$4.50</b></p><div><span>Total</span><strong>$18.50</strong></div><em><Check size={13}/>Payment approved</em></div><div className="preview-cashier__receipt"><ReceiptText size={15}/><i/><i/><i/></div></div></PreviewFrame>;
}

function AdminPreview() {
  return <PreviewFrame label="Management"><div className="preview-admin"><div className="preview-admin__metric"><small>Net revenue</small><strong>$24,860</strong><span>+12.4%</span></div><div className="preview-admin__chart"><svg viewBox="0 0 320 120" preserveAspectRatio="none"><path className="area" d="M0,106 C35,94 47,100 74,78 S121,83 146,58 S188,68 212,39 S268,48 320,13 L320,120 L0,120 Z"/><path className="line" d="M0,106 C35,94 47,100 74,78 S121,83 146,58 S188,68 212,39 S268,48 320,13"/></svg><div><i/><i/><i/><i/><i/><i/></div></div><div className="preview-admin__notice"><CircleDollarSign size={16}/><span><b>Daily target reached</b><small>Revenue is 8% above forecast</small></span></div></div></PreviewFrame>;
}

function OrderDisplayPreview() {
  return <PreviewFrame label="Pickup screen"><div className="preview-display"><div><header>Preparing <span>3</span></header><section><b>104</b><b>106</b><b className="is-moving">108</b></section></div><div className="is-ready"><header>Ready <span>2</span></header><section><b>098</b><b>102</b><b className="is-arriving">108</b></section></div></div></PreviewFrame>;
}
