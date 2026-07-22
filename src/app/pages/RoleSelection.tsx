import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BarChart3, ChefHat, Monitor, ReceiptText, TabletSmartphone, type LucideIcon } from "lucide-react";
import type { DeviceMode } from "../auth/roleConfig";
import MorrowLogo from "../components/branding/MorrowLogo";
import "./RoleSelection.css";

type SelectableMode = Exclude<DeviceMode, "unassigned">;
type Props = { onSelect: (mode: SelectableMode, remember: boolean) => void };
type Workspace = {
  id: SelectableMode;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  accentRgb: string;
  defaultRemember: boolean;
};

const WORKSPACES: readonly Workspace[] = [
  { id: "customer", title: "Customer Kiosk", description: "Start a new guest order with a fast, guided self-service experience.", icon: TabletSmartphone, accent: "#d7ff7a", accentRgb: "215,255,122", defaultRemember: true },
  { id: "admin", title: "Admin", description: "Manage performance, menus, locations, integrations, and platform settings.", icon: BarChart3, accent: "#60a5fa", accentRgb: "96,165,250", defaultRemember: false },
  { id: "cashier", title: "Cashier", description: "Create orders, accept payments, print receipts, and manage the register.", icon: ReceiptText, accent: "#a78bfa", accentRgb: "167,139,250", defaultRemember: false },
  { id: "kitchen", title: "Kitchen", description: "Receive live orders and manage preparation status from one focused view.", icon: ChefHat, accent: "#fb923c", accentRgb: "251,146,60", defaultRemember: false },
  { id: "display", title: "Order Display", description: "Show preparing and ready order numbers on a clear public-facing screen.", icon: Monitor, accent: "#34d399", accentRgb: "52,211,153", defaultRemember: true },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

const AMBIENT_PARTICLES = [
  [3, 12, 1, 18, 0], [8, 73, 2, 22, 3], [15, 91, 1, 16, 6], [23, 8, 1, 20, 2],
  [77, 7, 2, 24, 8], [88, 17, 1, 19, 4], [96, 38, 2, 26, 1], [92, 82, 1, 21, 7],
  [82, 94, 3, 25, 5], [68, 90, 1, 17, 9], [5, 48, 2, 23, 10], [31, 95, 1, 18, 4],
  [97, 64, 1, 20, 12], [54, 5, 2, 27, 6],
] as const;

function RestaurantBackground({ reducedMotion }: { reducedMotion: boolean }) {
  return <div className="workspace-environment" aria-hidden="true">
    <div className="workspace-lights"><i /><i /><i /></div>
    <svg className="restaurant-map" viewBox="0 0 1200 690" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="map-fade"><stop offset="54%" stopColor="white" /><stop offset="100%" stopColor="black" /></radialGradient>
        <mask id="map-mask"><rect width="1200" height="690" fill="url(#map-fade)" /></mask>
        <filter id="map-pulse-glow"><feGaussianBlur stdDeviation="2.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g mask="url(#map-mask)" className="restaurant-map__plan">
        <rect x="75" y="145" width="1050" height="430" rx="42" />
        <rect x="112" y="205" width="190" height="150" rx="22" />
        <rect x="335" y="168" width="220" height="112" rx="18" />
        <rect x="590" y="168" width="350" height="225" rx="25" />
        <rect x="335" y="320" width="220" height="200" rx="20" />
        <rect x="975" y="215" width="108" height="250" rx="20" />
        <rect x="590" y="430" width="350" height="90" rx="18" />
        <path d="M112 385h190M365 355h160M625 205h280M625 245h280M625 285h280M625 325h150M805 325h100" />
        <path d="M165 236h84v86h-84zM382 197h125v54H382zM375 365h140v110H375zM1006 255h47v150h-47z" className="restaurant-map__secondary" />
        <g className="restaurant-map__nodes">{[[207,280],[445,224],[445,420],[755,350],[1029,330],[760,475]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />)}</g>
      </g>
      <g mask="url(#map-mask)" className="restaurant-map__flows">
        <path id="order-flow" d="M207 280 C300 280 330 224 445 224 S570 350 755 350 S920 330 1029 330 S900 475 760 475 S570 420 445 420" />
        <path id="service-flow" d="M207 300 C345 390 520 305 650 252 S865 205 1029 280" />
        <path id="admin-flow" d="M445 420 C590 555 835 555 1029 385" />
      </g>
      {!reducedMotion && <g className="restaurant-map__pulses" filter="url(#map-pulse-glow)">
        <circle r="3"><animateMotion dur="14s" repeatCount="indefinite"><mpath href="#order-flow" /></animateMotion></circle>
        <circle r="2.5"><animateMotion dur="12s" begin="-5s" repeatCount="indefinite"><mpath href="#service-flow" /></animateMotion></circle>
        <circle r="2"><animateMotion dur="16s" begin="-9s" repeatCount="indefinite"><mpath href="#admin-flow" /></animateMotion></circle>
      </g>}
    </svg>
    <div className="workspace-perspective-grid" />
    <svg className="workspace-contours" viewBox="0 0 320 240"><path d="M-5 215C55 155 95 235 153 175S246 120 329 167M-12 185c69-73 111 14 165-44s116-64 180-9M-20 150c76-75 126-5 174-48s116-65 183-17M-18 112c73-65 128-4 176-43s111-54 170-28" /></svg>
    <div className="workspace-particles">{AMBIENT_PARTICLES.map(([left, top, size, duration, delay], index) => <i key={`${left}-${top}`} className={index === 3 || index === 8 || index === 12 ? "is-lime" : ""} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `-${delay}s` }} />)}</div>
    <div className="workspace-focus-halo" /><div className="workspace-vignette" />
  </div>;
}

function WorkspaceNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  return <svg className="workspace-network" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
    <defs><filter id="pulse-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    <path id="workflow-route" d="M100 140 C240 38 360 242 500 140 S690 44 900 140 S510 236 300 140" />
    <path className="workspace-network__trace" d="M100 140 C240 38 360 242 500 140 S690 44 900 140 S510 236 300 140" />
    {[100, 300, 500, 700, 900].map(x => <circle key={x} cx={x} cy="140" r="3" className="workspace-network__node" />)}
    {!reducedMotion && <circle r="4" className="workspace-network__pulse" filter="url(#pulse-glow)"><animateMotion dur="10s" repeatCount="indefinite"><mpath href="#workflow-route" /></animateMotion></circle>}
  </svg>;
}

function RoleMicroAnimation({ role }: { role: SelectableMode }) {
  if (role === "admin") return <span className="role-micro role-micro--bars"><i /><i /><i /></span>;
  if (role === "cashier") return <span className="role-micro role-micro--receipt"><i /></span>;
  if (role === "kitchen") return <span className="role-micro role-micro--steam"><i /><i /></span>;
  if (role === "display") return <span className="role-micro role-micro--status"><i /></span>;
  return <span className="role-micro role-micro--screen"><i /></span>;
}

function WorkspaceCard({ workspace, selected, dimmed, reducedMotion, onChoose }: {
  workspace: Workspace; selected: boolean; dimmed: boolean; reducedMotion: boolean; onChoose: (workspace: Workspace) => void;
}) {
  const Icon = workspace.icon;
  const moveLight = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - bounds.top}px`);
  };
  const style = { "--accent": workspace.accent, "--accent-rgb": workspace.accentRgb } as CSSProperties;
  return <motion.button
    type="button" style={style} onPointerMove={moveLight} onClick={() => onChoose(workspace)}
    aria-label={`Open ${workspace.title} workspace`} aria-busy={selected} disabled={dimmed || selected}
    initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: dimmed ? .46 : 1, y: 0 }}
    transition={{ duration: reducedMotion ? .1 : .32, ease }}
    className={`workspace-card group ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}`}
  >
    <span className="workspace-card__light" aria-hidden="true" />
    <span className="workspace-card__topline" aria-hidden="true" />
    <span className="workspace-card__icon"><Icon size={25} strokeWidth={1.8} /><RoleMicroAnimation role={workspace.id} /></span>
    <span className="workspace-card__content">
      <span className="workspace-card__title">{workspace.title}</span>
      <span className="workspace-card__description">{workspace.description}</span>
    </span>
    <span className="workspace-card__action">Open workspace <ArrowRight size={15} aria-hidden="true" /></span>
    {selected && <span className="workspace-card__loading" aria-hidden="true"><i /></span>}
  </motion.button>;
}

export default function RoleSelection({ onSelect }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [selected, setSelected] = useState<SelectableMode | null>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); }, []);

  const choose = (workspace: Workspace) => {
    if (selected) return;
    setSelected(workspace.id);
    navigationTimer.current = setTimeout(() => onSelect(workspace.id, workspace.defaultRemember), reducedMotion ? 0 : 220);
  };
  const moveEnvironment = (event: PointerEvent<HTMLElement>) => {
    if (reducedMotion || event.pointerType === "touch") return;
    const x = event.clientX / window.innerWidth - .5;
    const y = event.clientY / window.innerHeight - .5;
    event.currentTarget.style.setProperty("--environment-x", x.toFixed(3));
    event.currentTarget.style.setProperty("--environment-y", y.toFixed(3));
  };
  const enter = (delay: number, y = 0) => ({
    initial: reducedMotion ? false as const : { opacity: 0, y }, animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? .1 : .38, delay: reducedMotion ? 0 : delay, ease },
  });

  return <main className="workspace-page" onPointerMove={moveEnvironment}>
    <RestaurantBackground reducedMotion={reducedMotion} />
    <div className="workspace-shell">
      <motion.header {...enter(0)} className="workspace-header">
        <MorrowLogo variant="full" priority className="workspace-logo" />
        <div className="workspace-status"><i />Restaurant Operating Platform</div>
      </motion.header>

      <section className="workspace-main" aria-labelledby="workspace-title">
        <div className="workspace-intro">
          <motion.p {...enter(.06)} className="workspace-eyebrow">Device setup</motion.p>
          <motion.h1 {...enter(.12, 12)} id="workspace-title">How will this device be used?</motion.h1>
          <motion.p {...enter(.2)} className="workspace-subtitle">Choose one workspace. Each role opens a focused application with only the tools it needs.</motion.p>
        </div>
        <div className="workspace-grid-wrap">
          <WorkspaceNetwork reducedMotion={reducedMotion} />
          <div className="workspace-grid">
            {WORKSPACES.map((workspace, index) => <motion.div key={workspace.id} className="workspace-card-wrap" initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32, delay: reducedMotion ? 0 : .26 + index * .055, ease }}>
              <WorkspaceCard workspace={workspace} selected={selected === workspace.id} dimmed={selected !== null && selected !== workspace.id} reducedMotion={reducedMotion} onChoose={choose} />
            </motion.div>)}
          </div>
        </div>
        <motion.div {...enter(.58)} className="workspace-platform"><span><i /><i /><i /></span>One platform. Every restaurant workflow connected.</motion.div>
      </section>
    </div>
  </main>;
}
