import type { ReactNode } from "react";
import { LogOut, RotateCcw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { StaffRole } from "../auth/roleConfig";

export default function StaffLayout({ role, children, onLoggedOut, onChangeMode }: { role: StaffRole; children: ReactNode; onLoggedOut: () => void; onChangeMode: () => void }) {
  const { logout } = useAuth();
  return <div className="relative min-h-screen">
    {children}
    <div className="fixed bottom-4 right-4 z-[9999] flex gap-2 rounded-2xl border border-[#ECECEC] bg-white p-2 shadow-[0_12px_36px_rgba(31,31,31,.12)]">
      <span className="hidden items-center px-3 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF] md:flex">{role} session</span>
      <button onClick={() => { void logout().then(onLoggedOut); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#6B7280] transition-colors hover:bg-[#C41E19]/5 hover:text-[#C41E19] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/35"><LogOut size={13}/> Logout</button>
      <button onClick={onChangeMode} className="flex items-center gap-2 rounded-xl border border-[#ECECEC] bg-[#F8F9FA] px-3 py-2 text-xs font-semibold text-[#6B7280] transition-colors hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/35"><RotateCcw size={13}/> Change mode</button>
    </div>
  </div>;
}
