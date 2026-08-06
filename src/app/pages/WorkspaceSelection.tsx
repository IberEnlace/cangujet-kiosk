import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BarChart3, ChefHat, Cloud, Cpu, CreditCard, Monitor, Printer, ReceiptText, TabletSmartphone, type LucideIcon } from "lucide-react";
import type { DeviceMode } from "../auth/roleConfig";
import CangujetLogo from "../components/branding/MorrowLogo";
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
  { id: "customer", title: "Customer Kiosk", description: "Start a new guest order with a fast, guided self-service experience.", icon: TabletSmartphone, accent: "#C41E19", accentRgb: "196,30,25", defaultRemember: true },
  { id: "admin", title: "Admin", description: "Manage performance, menus, locations, integrations, and platform settings.", icon: BarChart3, accent: "#3B82F6", accentRgb: "59,130,246", defaultRemember: false },
  { id: "cashier", title: "Cashier", description: "Create orders, accept payments, print receipts, and manage the register.", icon: ReceiptText, accent: "#7C3AED", accentRgb: "124,58,237", defaultRemember: false },
  { id: "kitchen", title: "Kitchen", description: "Receive live orders and manage preparation status from one focused view.", icon: ChefHat, accent: "#EA580C", accentRgb: "234,88,12", defaultRemember: false },
  { id: "display", title: "Order Display", description: "Show preparing and ready order numbers on a clear public-facing screen.", icon: Monitor, accent: "#059669", accentRgb: "5,150,105", defaultRemember: true },
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
    <div className="workspace-tech-glyphs">
      <span className="is-pos"><TabletSmartphone /></span><span className="is-kds"><Monitor /></span>
      <span className="is-printer"><Printer /></span><span className="is-payment"><CreditCard /></span>
      <span className="is-cloud"><Cloud /></span><span className="is-ai"><Cpu /></span>
    </div>
    <div className="workspace-particles">{AMBIENT_PARTICLES.map(([left, top, size, duration, delay], index) => <i key={`${left}-${top}`} className={index === 3 || index === 8 || index === 12 ? "is-lime" : ""} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `-${delay}s` }} />)}</div>
    <div className="workspace-focus-halo" /><div className="workspace-spotlight" /><div className="workspace-vignette" />
  </div>;
}

function RoleMicroAnimation({ role }: { role: SelectableMode }) {
  if (role === "admin") return <span className="role-micro role-micro--bars"><i /><i /><i /></span>;
  if (role === "cashier") return <span className="role-micro role-micro--receipt"><i /></span>;
  if (role === "kitchen") return <span className="role-micro role-micro--steam"><i /><i /></span>;
  if (role === "display") return <span className="role-micro role-micro--status"><i /></span>;
  return <span className="role-micro role-micro--screen"><i /></span>;
}

function WorkspaceCard({ workspace, selected, dimmed, softDimmed, reducedMotion, onChoose, onActiveChange }: {
  workspace: Workspace; selected: boolean; dimmed: boolean; softDimmed: boolean; reducedMotion: boolean; onChoose: (workspace: Workspace) => void; onActiveChange: (active: boolean) => void;
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
    type="button" style={style} onPointerMove={moveLight} onPointerEnter={() => onActiveChange(true)} onPointerLeave={() => onActiveChange(false)} onFocus={() => onActiveChange(true)} onBlur={() => onActiveChange(false)} onClick={() => onChoose(workspace)}
    aria-label={`Open ${workspace.title} workspace`} aria-busy={selected} disabled={dimmed || selected}
    initial={false} animate={{ opacity: dimmed ? .34 : softDimmed ? .62 : 1 }}
    transition={{ duration: reducedMotion ? .1 : .32, ease }}
    className={`workspace-card group ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""} ${softDimmed ? "is-neighbor-dimmed" : ""}`}
  >
    <span className="workspace-card__light" aria-hidden="true" />
    <span className="workspace-card__topline" aria-hidden="true" />
    <span className="workspace-card__icon"><Icon size={25} strokeWidth={1.8} /><RoleMicroAnimation role={workspace.id} /></span>
    <span className="workspace-card__content">
      <span className="workspace-card__title">{workspace.title}</span>
      <span className="workspace-card__description">{workspace.description}</span>
    </span>
    <span className="workspace-card__action">{selected ? "Opening Workspace…" : "Open workspace"} <ArrowRight size={15} aria-hidden="true" /></span>
    {selected && <span className="workspace-card__loading" aria-hidden="true"><i /></span>}
  </motion.button>;
}

export default function WorkspaceSelection({ onSelect }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [selected, setSelected] = useState<SelectableMode | null>(null);
  const [hovered, setHovered] = useState<SelectableMode | null>(null);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const environmentFrame = useRef<number | null>(null);
  const latestPointer = useRef({ x: 0, y: 0 });
  useEffect(() => () => {
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    if (environmentFrame.current !== null) cancelAnimationFrame(environmentFrame.current);
  }, []);

  const choose = (workspace: Workspace) => {
    if (selected) return;
    setSelected(workspace.id);
    setHovered(workspace.id);
    navigationTimer.current = setTimeout(() => onSelect(workspace.id, workspace.defaultRemember), reducedMotion ? 0 : 700);
  };
  const moveEnvironment = (event: PointerEvent<HTMLElement>) => {
    if (reducedMotion || event.pointerType === "touch") return;
    latestPointer.current = { x: event.clientX, y: event.clientY };
    if (environmentFrame.current !== null) return;
    const target = event.currentTarget;
    environmentFrame.current = requestAnimationFrame(() => {
      const pointer = latestPointer.current;
      target.style.setProperty("--environment-x", (pointer.x / window.innerWidth - .5).toFixed(3));
      target.style.setProperty("--environment-y", (pointer.y / window.innerHeight - .5).toFixed(3));
      target.style.setProperty("--spotlight-x", `${pointer.x}px`);
      target.style.setProperty("--spotlight-y", `${pointer.y}px`);
      environmentFrame.current = null;
    });
  };
  const enter = (delay: number, y = 0) => ({
    initial: reducedMotion ? false as const : { opacity: 0, y }, animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? .1 : .38, delay: reducedMotion ? 0 : delay, ease },
  });

  return <main className={`workspace-page ${selected ? "is-opening" : ""}`} onPointerMove={moveEnvironment}>
    <RestaurantBackground reducedMotion={reducedMotion} />
    <div className="workspace-opening-shade" aria-hidden="true" />
    <div className="workspace-shell">
      <motion.header className="workspace-header">
        <motion.div {...enter(0)}><CangujetLogo variant="full" priority className="workspace-logo" /></motion.div>
      </motion.header>

      <section className="workspace-main" aria-labelledby="workspace-title">
        <div className="workspace-intro">
          <motion.div {...enter(.08, 5)} className="workspace-status"><i />Platform Ready</motion.div>
          <motion.p {...enter(.13)} className="workspace-eyebrow">Device setup</motion.p>
          <motion.h1 initial={reducedMotion ? false : { opacity: 0, y: 14, filter: "blur(7px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reducedMotion ? .1 : .52, delay: reducedMotion ? 0 : .18, ease }} id="workspace-title">How will this device be used?</motion.h1>
          <motion.p {...enter(.26, 4)} className="workspace-subtitle">Choose one workspace. Each role opens a focused application with only the tools it needs.</motion.p>
        </div>
        <div className="workspace-grid-wrap">
          <div className="workspace-grid">
            {WORKSPACES.map((workspace, index) => <motion.div key={workspace.id} className="workspace-card-wrap" initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .38, delay: reducedMotion ? 0 : .42 + index * .08, ease }}>
              <div className="workspace-card-float" style={{ "--accent-rgb": workspace.accentRgb } as CSSProperties}>
                <WorkspaceCard workspace={workspace} selected={selected === workspace.id} dimmed={selected !== null && selected !== workspace.id} softDimmed={!selected && hovered !== null && hovered !== workspace.id} reducedMotion={reducedMotion} onChoose={choose} onActiveChange={active => setHovered(current => active ? workspace.id : current === workspace.id ? null : current)} />
              </div>
            </motion.div>)}
          </div>
        </div>
        <motion.div {...enter(.9)} className="workspace-platform" role="status" aria-live="polite" aria-atomic="true"><span><i /><i /><i /></span>{selected ? "Opening Workspace…" : "cangujet kiosk — every workflow connected."}</motion.div>
      </section>
    </div>
  </main>;
}
