import { useState } from "react";
import {
  Heart, Clock, RefreshCw, Award, Gift, Share2, Bell, Settings,
  Globe, Moon, Accessibility, Phone, Star, ArrowLeft,
  Check, Plus, Trophy, User, Mail,
  MessageSquare, ChevronDown, ChevronUp,
  Sun, Monitor, Baby, UserCheck
} from "lucide-react";
import { useCart } from "../context/CartContext";

type Tab = "profile" | "favorites" | "history" | "loyalty" | "achievements" | "referral" | "notifications" | "settings" | "feedback";

type Props = { onNavigate: (route: string) => void };

const MENU_ITEMS_DATA = [
  { id: "b1", name: "Spicy Nori Burger",  price: 8.90,  image: "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400", category: "burger", basePrice: 8.90, calories: 520 },
  { id: "b2", name: "Smoky Truffle Beef", price: 10.50, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400", category: "burger", basePrice: 10.50, calories: 680 },
  { id: "s1", name: "Rosemary Fries",     price: 3.50,  image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400", category: "side",   basePrice: 3.50,  calories: 320 },
  { id: "d1", name: "Iced Matcha Latte",  price: 4.50,  image: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400", category: "drink",  basePrice: 4.50,  calories: 150 },
];

const TABS = [
  { id: "profile",       label: "Profile",       icon: <User size={15} />         },
  { id: "favorites",     label: "Favorites",     icon: <Heart size={15} />        },
  { id: "history",       label: "History",       icon: <Clock size={15} />        },
  { id: "loyalty",       label: "Loyalty",       icon: <Award size={15} />        },
  { id: "achievements",  label: "Achievements",  icon: <Trophy size={15} />       },
  { id: "referral",      label: "Referral",      icon: <Share2 size={15} />       },
  { id: "notifications", label: "Notifications", icon: <Bell size={15} />         },
  { id: "settings",      label: "Settings",      icon: <Settings size={15} />     },
  { id: "feedback",      label: "Feedback",      icon: <MessageSquare size={15} />},
];

const tierConfig = {
  bronze:   { color: "text-amber-700",  bg: "bg-amber-700/10  border-amber-700/20",  label: "Bronze",   nextTier: "Silver",   nextPoints: 1000 },
  silver:   { color: "text-slate-300",  bg: "bg-slate-300/10  border-slate-300/20",  label: "Silver",   nextTier: "Gold",     nextPoints: 2500 },
  gold:     { color: "text-amber-400",  bg: "bg-amber-400/10  border-amber-400/20",  label: "Gold",     nextTier: "Platinum", nextPoints: 5000 },
  platinum: { color: "text-violet-300", bg: "bg-violet-300/10 border-violet-300/20", label: "Platinum", nextTier: null,       nextPoints: null },
};

export default function UserProfile({ onNavigate }: Props) {
  const { user, toggleFavorite, addItem, updateUser } = useCart();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [npsHover, setNpsHover] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: user.name, email: user.email, phone: user.phone, birthdate: user.birthdate || "" });
  const [notifications, setNotifications] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("morrow_notification_settings") || "{}") as Record<string, boolean>; } catch { return {}; }
  });
  const [mealRating, setMealRating] = useState(0);

  const tier = tierConfig[user.tier];
  const favoriteItems = MENU_ITEMS_DATA.filter(i => user.favorites.includes(i.id));

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(user.referralCode).catch(() => {});
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2000);
  };

  const handleReorder = (orderId: string) => {
    const order = user.orderHistory.find(o => o.id === orderId);
    if (!order) return;
    order.items.forEach(item => {
      const menuItem = MENU_ITEMS_DATA.find(m => m.name === item.name);
      if (menuItem) addItem(menuItem);
    });
    onNavigate("cart");
  };

  const renderTab = () => {
    switch (activeTab) {
      case "profile": return (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-gradient-to-br from-[#1a2010] to-[#0f140b] border border-[#d7ff7a]/15 p-6 flex items-center gap-5">
            <div className="size-20 rounded-2xl bg-[#d7ff7a]/20 border border-[#d7ff7a]/30 flex items-center justify-center text-3xl font-black text-[#d7ff7a]">
              {user.name[0]}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">{user.name}</h2>
              <p className="text-white/50 text-sm">{user.email}</p>
              <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full border text-xs font-bold ${tier.bg} ${tier.color}`}>
                <Award size={12} /> {tier.label} Member
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-amber-400">{user.loyaltyPoints.toLocaleString()}</p>
              <p className="text-xs text-white/40">loyalty points</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Name",      val: user.name,  icon: <User size={14} />       },
              { label: "Email",     val: user.email, icon: <Mail size={14} />       },
              { label: "Phone",     val: user.phone, icon: <Phone size={14} />      },
              { label: "Birthday",  val: user.birthdate || "Not set", icon: <Gift size={14} /> },
            ].map(f => (
              <div key={f.label} className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1.5">
                  {f.icon} <span className="text-xs uppercase tracking-wider">{f.label}</span>
                </div>
                <p className="font-semibold text-sm">{f.val}</p>
              </div>
            ))}
          </div>

          {editingProfile && <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            {(["name","email","phone","birthdate"] as const).map(field => <label key={field} className="text-xs capitalize text-white/45">{field}<input type={field === "birthdate" ? "date" : field === "email" ? "email" : "text"} value={profileDraft[field]} onChange={event => setProfileDraft(previous => ({ ...previous, [field]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none" /></label>)}
          </div>}
          <button onClick={() => { if (editingProfile) updateUser(profileDraft); setEditingProfile(value => !value); }} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-white/10 text-sm text-white/50 hover:text-white hover:border-white/20 transition-all">
            <Settings size={14} /> {editingProfile ? "Save Profile" : "Edit Profile"}
          </button>
        </div>
      );

      case "favorites": return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">My Favorites ({favoriteItems.length})</h3>
          </div>
          {favoriteItems.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <Heart size={36} className="text-white/15" />
              <p className="text-white/30">No favorites yet. Add items you love!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {favoriteItems.map(item => (
                <div key={item.id} className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden hover:border-[#d7ff7a]/20 transition-all group">
                  <div className="relative">
                    <img src={item.image} alt={item.name} className="w-full h-32 object-cover" />
                    <button
                      onClick={() => toggleFavorite(item.id)}
                      className="absolute top-2 right-2 size-8 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center hover:bg-red-500/20 transition-colors"
                    >
                      <Heart size={14} className="text-red-400 fill-red-400" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm">{item.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#d7ff7a] font-bold">${item.price.toFixed(2)}</span>
                      <button
                        onClick={() => { addItem(item); onNavigate("cart"); }}
                        className="flex items-center gap-1 text-xs bg-[#d7ff7a]/10 hover:bg-[#d7ff7a]/20 text-[#d7ff7a] px-2.5 py-1.5 rounded-xl transition-all border border-[#d7ff7a]/20"
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );

      case "history": return (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">Order History ({user.orderHistory.length})</h3>
          {user.orderHistory.map(order => (
            <div key={order.id} className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden">
              <button
                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-white/60">{order.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${order.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">{order.date} · {order.items.length} items · {order.paymentMethod}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#d7ff7a]">${order.total.toFixed(2)}</span>
                  {expandedOrder === order.id ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                </div>
              </button>

              {expandedOrder === order.id && (
                <div className="border-t border-white/5 px-4 pb-4">
                  <div className="flex flex-col gap-2 py-3">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-white/60">{item.qty}x {item.name}</span>
                        <span className="text-white/40">${(item.price * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleReorder(order.id)}
                    className="flex items-center gap-2 text-xs bg-[#d7ff7a]/10 hover:bg-[#d7ff7a]/20 text-[#d7ff7a] px-4 py-2 rounded-xl transition-all border border-[#d7ff7a]/20 font-semibold"
                  >
                    <RefreshCw size={12} /> Reorder
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      );

      case "loyalty": return (
        <div className="flex flex-col gap-4">
          <div className={`rounded-2xl border p-5 ${tier.bg}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className={`text-xs uppercase tracking-wider font-bold ${tier.color}`}>{tier.label} Tier</p>
                <p className="text-2xl font-black mt-0.5">{user.loyaltyPoints.toLocaleString()} pts</p>
              </div>
              <Award size={32} className={tier.color} />
            </div>
            {tier.nextTier && tier.nextPoints && (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-white/40">{user.loyaltyPoints} / {tier.nextPoints} pts</span>
                  <span className={tier.color}>{tier.nextTier} next</span>
                </div>
                <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all`} style={{ width: `${Math.min(100, (user.loyaltyPoints / tier.nextPoints) * 100)}%` }} />
                </div>
                <p className="text-xs text-white/30 mt-1.5">{tier.nextPoints - user.loyaltyPoints} more points to {tier.nextTier}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Points Value",    val: `$${(user.loyaltyPoints * 0.01).toFixed(2)}`, color: "text-[#d7ff7a]" },
              { label: "Orders Placed",   val: user.orderHistory.length, color: "text-blue-400" },
              { label: "Total Spent",     val: `$${user.orderHistory.reduce((s, o) => s + o.total, 0).toFixed(0)}`, color: "text-violet-400" },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/8 p-3 text-center">
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-4">
            <h4 className="font-semibold text-sm mb-3 text-white/70">🎂 Birthday Reward</h4>
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-xl">🎁</div>
              <div>
                <p className="font-semibold text-sm">Free Dessert on Your Birthday!</p>
                <p className="text-xs text-white/40 mt-0.5">Set your birthday to unlock this reward</p>
              </div>
              <button onClick={() => { setActiveTab("profile"); setEditingProfile(true); }} className="ml-auto text-xs text-[#d7ff7a] border border-[#d7ff7a]/20 px-3 py-1.5 rounded-xl hover:bg-[#d7ff7a]/10 transition-all">Set</button>
            </div>
          </div>
        </div>
      );

      case "achievements": return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Achievements</h3>
            <span className="text-sm text-white/40">{user.achievements.filter(a => a.unlocked).length}/{user.achievements.length} unlocked</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {user.achievements.map(ach => (
              <div key={ach.id} className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all ${ach.unlocked ? "border-[#d7ff7a]/20 bg-[#d7ff7a]/5" : "border-white/8 bg-white/[0.02] opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{ach.icon}</span>
                  {ach.unlocked && <span className="size-5 rounded-full bg-[#d7ff7a] flex items-center justify-center"><Check size={12} className="text-[#17200f]" /></span>}
                </div>
                <div>
                  <p className={`font-semibold text-sm ${ach.unlocked ? "text-white" : "text-white/40"}`}>{ach.title}</p>
                  <p className="text-xs text-white/30 mt-0.5">{ach.description}</p>
                  {ach.progress !== undefined && ach.max && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-white/30 mb-1"><span>{ach.progress}/{ach.max}</span></div>
                      <div className="h-1 rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${ach.unlocked ? "bg-[#d7ff7a]" : "bg-white/30"}`} style={{ width: `${(ach.progress / ach.max) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

      case "referral": return (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/20 p-6 text-center">
            <div className="size-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
              <Share2 size={24} className="text-violet-400" />
            </div>
            <h3 className="text-xl font-black">Refer & Earn</h3>
            <p className="text-white/50 text-sm mt-2">Share your code and earn 500 points for each friend who orders!</p>
          </div>

          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-4 flex flex-col gap-3">
            <p className="text-xs text-white/40 uppercase tracking-wider">Your Referral Code</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 text-[#d7ff7a] font-mono text-xl font-black rounded-xl px-5 py-3 text-center tracking-[0.3em]">
                {user.referralCode}
              </code>
              <button
                onClick={handleCopyReferral}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${copiedReferral ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" : "bg-[#d7ff7a] text-[#17200f] hover:bg-[#c8f060]"}`}
              >
                {copiedReferral ? <><Check size={14} className="inline mr-1" />Copied!</> : "Copy"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Friends Referred", val: "2",    color: "text-violet-400" },
              { label: "Points Earned",    val: "1,000",color: "text-amber-400" },
              { label: "Target (5)",       val: "2/5",  color: "text-[#d7ff7a]" },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/8 p-3 text-center">
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[11px] text-white/30 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      );

      case "notifications": return (
        <div className="flex flex-col gap-4">
          <h3 className="font-bold">Notifications</h3>
          {[
            { label: "Order Updates",    desc: "Get notified when your order is ready", on: true },
            { label: "Offers & Promos",  desc: "Special deals and discount codes",     on: true },
            { label: "Loyalty Rewards",  desc: "Points and tier updates",              on: true },
            { label: "New Menu Items",   desc: "When new dishes are added",            on: false },
            { label: "Birthday Rewards", desc: "Unlock birthday surprises",            on: true },
            { label: "Referral Updates", desc: "When your friends sign up",           on: false },
          ].map(n => { const enabled = notifications[n.label] ?? n.on; return (
            <div key={n.label} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/8">
              <div className="flex-1">
                <p className="font-semibold text-sm">{n.label}</p>
                <p className="text-xs text-white/40 mt-0.5">{n.desc}</p>
              </div>
              <button onClick={() => { const next = { ...notifications, [n.label]: !enabled }; setNotifications(next); localStorage.setItem("morrow_notification_settings", JSON.stringify(next)); }} className={`relative w-11 h-6 rounded-full transition-all ${enabled ? "bg-[#d7ff7a]" : "bg-white/10"}`}>
                <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
              </button>
            </div>
          );})}
        </div>
      );

      case "settings": return (
        <div className="flex flex-col gap-4">
          <h3 className="font-bold">Settings</h3>

          {/* Language */}
          <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={15} className="text-white/40" />
              <h4 className="font-semibold text-sm">Language</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {["English", "العربية", "Français", "Español", "Deutsch", "中文"].map(lang => (
                <button
                  key={lang}
                  onClick={() => updateUser({ language: lang })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${user.language === lang ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/50 hover:text-white border border-white/8"}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Moon size={15} className="text-white/40" />
              <h4 className="font-semibold text-sm">Theme</h4>
            </div>
            <div className="flex gap-2">
              {[
                { id: "dark",  label: "Dark",  icon: <Moon size={14} />    },
                { id: "light", label: "Light", icon: <Sun size={14} />     },
                { id: "auto",  label: "Auto",  icon: <Monitor size={14} /> },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => updateUser({ theme: t.id === "light" ? "light" : "dark" })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${user.theme === t.id ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/50 hover:text-white border border-white/8"}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accessibility Mode */}
          <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Accessibility size={15} className="text-white/40" />
              <h4 className="font-semibold text-sm">Accessibility Mode</h4>
            </div>
            <div className="flex gap-2">
              {[
                { id: "normal", label: "Normal", icon: <User size={14} />        },
                { id: "kids",   label: "Kids",   icon: <Baby size={14} />        },
                { id: "senior", label: "Senior", icon: <UserCheck size={14} />   },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => updateUser({ accessibilityMode: m.id as "normal" | "kids" | "senior" })}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all ${user.accessibilityMode === m.id ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/50 hover:text-white border border-white/8"}`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Emergency Support */}
          <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Phone size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-red-400">Emergency Support</p>
              <p className="text-xs text-white/30">Call staff for immediate help</p>
            </div>
            <a href="tel:+15550006776" className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-all">Call</a>
          </div>
        </div>
      );

      case "feedback": return (
        <div className="flex flex-col gap-5">
          <div className="text-center">
            <h3 className="text-xl font-bold">How was your experience?</h3>
            <p className="text-white/40 text-sm mt-1">Help us improve by rating your visit</p>
          </div>

          {/* NPS Score */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
            <p className="text-sm text-white/60 mb-3 text-center">How likely are you to recommend us to a friend? (0-10)</p>
            <div className="flex gap-1.5 justify-center flex-wrap">
              {[...Array(11)].map((_, i) => (
                <button
                  key={i}
                  onMouseEnter={() => setNpsHover(i)}
                  onMouseLeave={() => setNpsHover(null)}
                  onClick={() => setNpsScore(i)}
                  className={`size-10 rounded-xl text-sm font-bold transition-all ${
                    npsScore === i ? "bg-[#d7ff7a] text-[#17200f] scale-110" :
                    (npsHover !== null && i <= npsHover) ? "bg-[#d7ff7a]/30 text-[#d7ff7a]" :
                    i >= 9 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    i >= 7 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-white/25 mt-2 px-1">
              <span>Not likely</span><span>Extremely likely</span>
            </div>
          </div>

          {/* Star Rating */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
            <p className="text-sm text-white/60 mb-3 text-center">Overall meal rating</p>
            <div className="flex gap-3 justify-center">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setMealRating(s)} className="transition-transform hover:scale-125">
                  <Star size={36} className={`text-amber-400 transition-all ${s <= mealRating ? "fill-amber-400" : ""}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Written Feedback */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
            <p className="text-sm text-white/60 mb-3">Additional comments (optional)</p>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="Tell us about your experience..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-[#d7ff7a]/30"
              rows={4}
            />
          </div>

          {feedbackSent ? (
            <div className="flex items-center justify-center gap-2 py-4 text-[#d7ff7a] font-bold">
              <Check size={20} /> Thank you for your feedback!
            </div>
          ) : (
            <button
              onClick={() => { localStorage.setItem("morrow_feedback", JSON.stringify({ npsScore, mealRating, feedbackText, submittedAt: new Date().toISOString() })); setFeedbackSent(true); }}
              disabled={npsScore === null || mealRating === 0}
              className="w-full py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold text-base hover:bg-[#c8f060] transition-all disabled:opacity-40"
            >
              Submit Feedback
            </button>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => onNavigate("portal")} className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="font-bold text-lg">My Account</h1>
          <p className="text-xs text-white/40">{user.name} · {tierConfig[user.tier].label}</p>
        </div>
      </header>

      <div className="flex flex-1 max-w-5xl mx-auto w-full px-6 py-6 gap-6">
        {/* Sidebar Tabs */}
        <aside className="w-48 flex-shrink-0 flex flex-col gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${activeTab === tab.id ? "bg-[#d7ff7a] text-[#17200f] font-bold" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1">{renderTab()}</main>
      </div>
    </div>
  );
}
