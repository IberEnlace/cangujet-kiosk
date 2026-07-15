import type { ReactNode } from "react";
import { LogOut, RotateCcw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { StaffRole } from "../auth/roleConfig";

export default function StaffLayout({ role, children, onLoggedOut, onChangeMode }: { role: StaffRole; children: ReactNode; onLoggedOut: () => void; onChangeMode: () => void }) {
  const { logout } = useAuth();
  return <div className="relative min-h-screen">
    {children}
    <div className="fixed bottom-4 right-4 z-[9999] flex gap-2 rounded-2xl border border-white/10 bg-[#0b0e0b]/90 backdrop-blur-xl p-2 shadow-2xl">
      <span className="hidden md:flex items-center px-3 text-[10px] uppercase tracking-widest text-white/30">{role} session</span>
      <button onClick={() => { logout(); onLoggedOut(); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/55 hover:bg-white/10 hover:text-white"><LogOut size={13}/> Logout</button>
      <button onClick={() => { logout(true); onChangeMode(); }} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/55 hover:bg-white/10 hover:text-white"><RotateCcw size={13}/> Change mode</button>
    </div>
  </div>;
}
