import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { StaffRole } from "../../auth/roleConfig";
import MorrowLogo from "../branding/MorrowLogo";

type Props = { role: StaffRole; title: string; description: string; onSuccess: () => void; onBack: () => void };

export default function StaffLogin({ role, title, description, onSuccess, onBack }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); const ok = await login(role, email, password); setLoading(false); if (ok) onSuccess(); else setError("The email or password is incorrect for this workspace."); };
  return <main className="min-h-screen bg-[#07090a] text-[#f0f0eb] grid lg:grid-cols-2 font-['DM_Sans']">
    <section className="hidden lg:flex p-12 flex-col justify-between border-r border-white/5 bg-gradient-to-br from-[#d7ff7a]/8 via-transparent to-blue-500/5"><MorrowLogo variant="full" priority className="h-auto w-52" /><div><ShieldCheck size={45} className="text-[#d7ff7a] mb-5"/><h2 className="text-4xl font-black max-w-md">Secure access for restaurant operations.</h2><p className="text-white/40 mt-4 max-w-lg">Role-scoped sessions keep each terminal focused and protect operational data.</p></div><p className="text-xs text-white/25">Morrow Restaurant Operating Platform</p></section>
    <section className="flex items-center justify-center p-6 relative"><button onClick={onBack} className="absolute top-7 left-7 flex items-center gap-2 text-sm text-white/40 hover:text-white"><ArrowLeft size={15}/> Back to role selection</button><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-7 md:p-9 shadow-2xl">
      <div className="size-12 rounded-2xl bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 text-[#d7ff7a] grid place-items-center mb-6"><LockKeyhole size={20}/></div><p className="text-xs uppercase tracking-[.2em] text-[#d7ff7a] font-bold">{role} workspace</p><h1 className="text-3xl font-black mt-2">{title}</h1><p className="text-sm text-white/40 mt-2 mb-7">{description}</p>
      <label className="text-xs font-semibold text-white/60">Email or employee ID<input autoFocus value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="mt-2 mb-5 w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-[#d7ff7a]/50" placeholder={`${role}@morrow.local`}/></label>
      <label className="text-xs font-semibold text-white/60">Password<div className="relative mt-2"><input value={password} onChange={e=>setPassword(e.target.value)} type={show?"text":"password"} required className="w-full h-12 rounded-xl bg-white/5 border border-white/10 px-4 pr-12 outline-none focus:border-[#d7ff7a]/50" placeholder="Enter your password"/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-4 top-3.5 text-white/35">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
      {error && <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}<button disabled={loading} className="mt-6 w-full h-12 rounded-xl bg-[#d7ff7a] text-[#17200f] font-black disabled:opacity-50">{loading?"Signing in…":"Sign in securely"}</button>
      <p className="mt-5 text-center text-[11px] text-white/25">Development authentication · Session ends on logout</p>
    </form></section>
  </main>;
}
