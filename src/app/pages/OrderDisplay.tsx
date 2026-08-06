import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { KitchenOrder, OrderStatus } from "../context/CartContext";
import MorrowLogo from "../components/branding/MorrowLogo";
import { usePublicOrderBoard } from "../hooks/useRealtimeOrders";

type Props={onNavigate:(route:string)=>void};
const COMPLETED_LIFETIME_MS=5*60_000;
const MAX_COMPLETED=8;

function orderTimestamp(order:KitchenOrder){return order.completedAt??order.startTime}
function playReadySound(){try{const context=new window.AudioContext();const oscillator=context.createOscillator();const gain=context.createGain();oscillator.frequency.value=784;gain.gain.setValueAtTime(.035,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.24);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.24);oscillator.addEventListener("ended",()=>context.close(),{once:true})}catch{/* Autoplay may be blocked; the visual announcement remains available. */}}

export default function OrderDisplay({onNavigate:_onNavigate}:Props){
  const board=usePublicOrderBoard();
  const kitchenOrders:KitchenOrder[]=board.orders.map(order=>({id:order.order_number,number:Number(order.order_number.match(/(\d+)$/)?.[1])||0,items:[],status:order.public_status==="ready"?"ready":order.public_status==="completed"?"completed":"preparing",priority:false,delayed:false,startTime:new Date(order.created_at).getTime(),completedAt:order.public_status==="completed"?Date.now():undefined,estimatedMinutes:12,type:"dine_in"}));
  const [now,setNow]=useState(Date.now());
  const [announcing,setAnnouncing]=useState<Set<string>>(new Set());
  const previousStatuses=useRef<Map<string,OrderStatus>|null>(null);

  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{const current=new Map(kitchenOrders.map(order=>[order.id,order.status]));if(previousStatuses.current){const newlyReady=kitchenOrders.filter(order=>order.status==="ready"&&previousStatuses.current?.get(order.id)!=="ready").map(order=>order.id);if(newlyReady.length){setAnnouncing(ids=>new Set([...ids,...newlyReady]));playReadySound();window.setTimeout(()=>setAnnouncing(ids=>{const next=new Set(ids);newlyReady.forEach(id=>next.delete(id));return next}),1100)}}previousStatuses.current=current},[kitchenOrders]);

  const readyOrders=useMemo(()=>kitchenOrders.filter(order=>order.status==="ready").sort((a,b)=>b.startTime-a.startTime),[kitchenOrders]);
  const preparingOrders=useMemo(()=>kitchenOrders.filter(order=>order.status==="received"||order.status==="preparing"||order.status==="cooking").sort((a,b)=>a.startTime-b.startTime),[kitchenOrders]);
  const completedOrders=useMemo(()=>kitchenOrders.filter(order=>order.status==="completed"&&now-orderTimestamp(order)<=COMPLETED_LIFETIME_MS).sort((a,b)=>orderTimestamp(b)-orderTimestamp(a)).slice(0,MAX_COMPLETED),[kitchenOrders,now]);
  const clock=new Date(now).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

  return <main className="flex min-h-screen select-none flex-col overflow-hidden bg-[#F8F9FA] text-[#1F1F1F]">
    {board.error?<div role="alert" className="border-b border-[#C41E19]/20 bg-[#C41E19]/5 px-4 py-2 text-center text-sm text-[#C41E19]">Order status is temporarily unavailable. Retrying automatically.</div>:null}
    <header className="flex items-center justify-between border-b border-[#ECECEC] bg-white px-[clamp(1rem,2.5vw,3rem)] py-[clamp(.8rem,1.5vh,1.25rem)] shadow-sm"><div><MorrowLogo variant="full" priority className="h-auto w-[clamp(8rem,10vw,12rem)]"/><p className="mt-1 text-[clamp(.55rem,.65vw,.75rem)] uppercase tracking-[.2em] text-[#9CA3AF]">Order Status Display</p></div><div className="flex items-center gap-2 text-[#6B7280]"><Clock size={20}/><time className="font-mono text-[clamp(1.1rem,1.6vw,2rem)] font-bold tabular-nums">{clock}</time></div></header>
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(310px,1fr)]">
      <section className="flex min-h-[52vh] min-w-0 flex-col border-b border-[#ECECEC] bg-white lg:min-h-0 lg:border-b-0 lg:border-r"><header className="flex items-center gap-3 border-b border-[#C41E19]/20 bg-[#C41E19]/5 px-[clamp(1rem,2vw,2rem)] py-4"><span className="size-3 rounded-full bg-[#C41E19]"/><h1 className="text-[clamp(1rem,1.5vw,1.6rem)] font-black uppercase tracking-[.14em] text-[#C41E19]">Ready for Pickup</h1><span className="ml-auto text-sm font-bold text-[#C41E19]/65">{readyOrders.length}</span></header>
        <div className="grid flex-1 content-center grid-cols-1 gap-[clamp(.75rem,1.5vw,1.5rem)] overflow-hidden p-[clamp(1rem,2vw,2rem)] sm:grid-cols-2">{readyOrders.length?readyOrders.map(order=><article key={order.id} className={`flex min-h-[clamp(11rem,25vh,20rem)] items-center justify-center rounded-2xl border-2 border-[#C41E19]/20 bg-[#C41E19]/5 p-5 text-center shadow-sm transition duration-500 ${announcing.has(order.id)?"scale-[1.05] border-[#C41E19] bg-[#C41E19]/10 shadow-[0_12px_32px_rgba(196,30,25,.14)]":"scale-100"}`}><div><div className="text-[clamp(4.5rem,9vw,10rem)] font-black leading-none tabular-nums text-[#C41E19]">{order.number}</div><p className="mt-4 text-[clamp(.75rem,1vw,1.15rem)] font-black uppercase tracking-[.18em] text-[#C41E19]">Ready for Pickup</p><p className="mt-2 text-[clamp(.7rem,.85vw,1rem)] font-medium text-[#6B7280]">Collect at Counter</p></div></article>):<div className="col-span-full flex flex-col items-center justify-center py-16 text-center"><Clock size={40} className="mb-4 text-[#9CA3AF]"/><p className="text-[clamp(1.1rem,1.6vw,1.8rem)] font-semibold text-[#9CA3AF]">No orders ready</p><p className="mt-2 text-[clamp(.8rem,1vw,1.1rem)] text-[#9CA3AF]">Your order will appear here.</p></div>}</div>
      </section>
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(170px,35%)]">
        <section className="flex min-h-0 flex-col border-b border-[#ECECEC] bg-white"><header className="flex items-center gap-2 border-b border-[#C41E19]/20 bg-[#C41E19]/5 px-5 py-4"><span className="size-3 rounded-full bg-[#C41E19]/50"/><h2 className="text-[clamp(.9rem,1.1vw,1.2rem)] font-bold uppercase tracking-widest text-[#C41E19]">Preparing</h2><span className="ml-auto text-sm text-[#C41E19]">{preparingOrders.length}</span></header><div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">{preparingOrders.length?preparingOrders.map(order=><article key={order.id} className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/5 px-5 py-3"><strong className="text-[clamp(2rem,3vw,3.6rem)] font-black tabular-nums text-[#C41E19]">{order.number}</strong><div className="text-right"><p className="text-[clamp(.65rem,.8vw,.85rem)] font-medium uppercase tracking-wider text-[#C41E19]">Estimated</p><p className="text-[clamp(1rem,1.35vw,1.5rem)] font-black text-[#C41E19]">{order.estimatedMinutes} min</p></div></article>):<div className="flex flex-1 items-center justify-center text-center text-[clamp(.9rem,1.1vw,1.2rem)] text-[#9CA3AF]">Preparing new orders...</div>}</div></section>
        <section className="flex min-h-0 flex-col bg-white"><header className="flex items-center gap-2 border-b border-[#ECECEC] bg-[#F8F9FA] px-5 py-3"><span className="size-2.5 rounded-full bg-[#C41E19]/50"/><h2 className="text-sm font-bold uppercase tracking-widest text-[#1F1F1F]">Completed</h2></header><div className="flex flex-1 flex-wrap content-start gap-2 overflow-hidden p-4">{completedOrders.length?completedOrders.map(order=><div key={order.id} className="grid min-h-14 min-w-20 place-items-center rounded-xl border border-[#ECECEC] bg-[#F8F9FA] px-4 py-2"><span className="text-[clamp(1.35rem,1.8vw,2.25rem)] font-bold tabular-nums text-[#6B7280]">{order.number}</span></div>):<div className="flex w-full flex-1 items-center justify-center text-sm text-[#9CA3AF]">No recent pickups.</div>}</div></section>
      </div>
    </div>
  </main>;
}
