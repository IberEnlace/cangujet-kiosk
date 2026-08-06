import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, BarChart3, ChefHat, Eye, EyeOff, LockKeyhole, ReceiptText } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { StaffRole } from "../../auth/roleConfig";
import CangujetLogo from "../branding/MorrowLogo";
import "./StaffLogin.css";

type Props = { role: StaffRole; title: string; description: string; onSuccess: () => void; onBack: () => void };

const ROLE_META = {
  admin: { accent: "#C41E19", rgb: "196,30,25", label: "Restaurant intelligence", statement: "See every signal. Shape every outcome.", icon: BarChart3 },
  cashier: { accent: "#C41E19", rgb: "196,30,25", label: "Point of sale", statement: "Every order, payment, and guest—moving together.", icon: ReceiptText },
  kitchen: { accent: "#C41E19", rgb: "196,30,25", label: "Kitchen operations", statement: "From incoming ticket to ready for service.", icon: ChefHat },
} as const;

function AdminEnvironment() {
  return <div className="auth-visual auth-visual--admin" aria-hidden="true">
    <div className="admin-dashboard">
      <div className="visual-toolbar"><i /><span /><span /></div>
      <div className="metric-row"><div><small>Revenue</small><strong>€24.8k</strong><em>+12.4%</em></div><div><small>Orders</small><strong>1,284</strong><em>+8.2%</em></div><div><small>Avg. time</small><strong>08:42</strong><em>−1.3m</em></div></div>
      <div className="admin-body"><div className="chart-card"><span className="chart-grid" /><svg viewBox="0 0 430 150"><path d="M5 125C55 118 65 73 112 86s64-44 108-29 70 62 112 17 60-38 94-57" /><path className="chart-fill" d="M5 125C55 118 65 73 112 86s64-44 108-29 70 62 112 17 60-38 94-57V150H5z" /></svg><i /><i /><i /></div><div className="data-nodes"><i /><i /><i /><i /><svg viewBox="0 0 160 150"><path d="M20 35L80 18l55 48-31 66-72-15zM20 35l84 97M80 18l24 114M32 117l103-51" /></svg></div></div>
    </div>
  </div>;
}

function CashierEnvironment() {
  return <div className="auth-visual auth-visual--cashier" aria-hidden="true">
    <div className="pos-terminal"><div className="pos-screen"><div className="visual-toolbar"><i /><span /><span /></div><div className="pos-products">{[0,1,2,3,4,5].map(i => <i key={i}><span /></i>)}</div><div className="pos-total"><span>Total</span><strong>€38.50</strong></div></div><div className="pos-base"><i /><i /><i /></div></div>
    <div className="receipt-paper"><strong>cangujet</strong><span /><span /><span /><em>€38.50</em></div>
    <div className="payment-card"><i /><span>•••• 2048</span><em>Approved</em></div>
    <span className="transaction-pulse pulse-one" /><span className="transaction-pulse pulse-two" />
  </div>;
}

function KitchenEnvironment() {
  return <div className="auth-visual auth-visual--kitchen" aria-hidden="true">
    <div className="kitchen-board"><div className="visual-toolbar"><i /><span /><span /></div><div className="ticket-lane">{["#184","#185","#186"].map((number,index) => <div className={`order-ticket ticket-${index+1}`} key={number}><span>{number}<i /></span><strong>{index === 2 ? "NEW" : index === 1 ? "COOKING" : "READY"}</strong><em /><em /><em /><div><i /><i /><i /></div></div>)}</div><div className="prep-timeline"><i /><span /><i /><span /><i /></div></div>
    <div className="heat-lines"><i /><i /><i /></div>
  </div>;
}

function RoleEnvironment({ role }: { role: StaffRole }) {
  if (role === "admin") return <AdminEnvironment />;
  if (role === "cashier") return <CashierEnvironment />;
  return <KitchenEnvironment />;
}

export default function StaffLogin({ role, title, description, onSuccess, onBack }: Props) {
  const { login } = useAuth();
  const reducedMotion = Boolean(useReducedMotion());
  const meta = ROLE_META[role];
  const RoleIcon = meta.icon;
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); const result = await login(role, email, password); setLoading(false); if (result.ok) onSuccess(); else setError(result.error === "wrong_workspace" ? "Your account is not assigned to this workspace." : result.error === "inactive_profile" ? "This staff account is inactive. Contact an administrator." : result.error === "missing_profile" ? "Your staff profile is not configured." : result.error === "service_error" ? "Authentication is temporarily unavailable. Please try again." : "The email or password is incorrect."); };
  const enter = (delay: number, x = 0, y = 0) => ({ initial: reducedMotion ? false as const : { opacity: 0, x, y }, animate: { opacity: 1, x: 0, y: 0 }, transition: { duration: reducedMotion ? .1 : .5, delay: reducedMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const } });

  return <main className={`auth-page auth-page--${role}`} style={{ "--role-accent": meta.accent, "--role-rgb": meta.rgb } as React.CSSProperties}>
    <section className="auth-environment-panel">
      <motion.div {...enter(.04)} className="auth-brand"><CangujetLogo variant="full" priority className="auth-brand__logo" /><span>{meta.label}</span></motion.div>
      <motion.div {...enter(.08, 0, 12)} className="auth-role-scene"><RoleEnvironment role={role} /></motion.div>
      <motion.div {...enter(.18)} className="auth-environment-copy"><span><RoleIcon size={15} /> {role} workspace</span><h2>{meta.statement}</h2><p>cangujet kiosk platform</p></motion.div>
    </section>

    <section className="auth-form-panel">
      <motion.button {...enter(.08)} onClick={onBack} className="auth-back"><ArrowLeft size={15}/> Back to role selection</motion.button>
      <motion.form {...enter(.18, 18)} onSubmit={submit} className="auth-card">
        <div className="auth-lock"><LockKeyhole size={19}/></div>
        <p className="auth-eyebrow">{role} workspace</p><h1>{title}</h1><p className="auth-description">{description}</p>
        <motion.div {...enter(.28, 0, 8)} className="auth-field"><label htmlFor={`${role}-email`}>Email or employee ID</label><input id={`${role}-email`} autoFocus value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder={`${role}@cangujet.local`}/></motion.div>
        <motion.div {...enter(.34, 0, 8)} className="auth-field"><label htmlFor={`${role}-password`}>Password</label><div className="auth-password"><input id={`${role}-password`} value={password} onChange={e=>setPassword(e.target.value)} type={show?"text":"password"} required placeholder="Enter your password"/><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></motion.div>
        {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="auth-error" role="alert">{error}</motion.p>}
        <motion.button {...enter(.4, 0, 8)} type="submit" disabled={loading} className="auth-submit"><span>{loading?"Signing in…":"Sign in securely"}</span>{loading && <i aria-hidden="true" />}</motion.button>
        <p className="auth-session-note">Secure staff authentication · Session ends on logout</p>
      </motion.form>
    </section>
  </main>;
}
