import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Languages, Package, UtensilsCrossed } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { serviceOptions } from "../../config/serviceOptions";
import { useCart, type OrderType } from "../../context/CartContext";
import { useLanguage } from "../../context/LanguageContext";
import { useCustomerTranslation } from "../../hooks/useCustomerTranslation";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";

interface ServiceSelectionProps { onBack: () => void; onContinue: () => void; }

export default function ServiceSelection({ onBack, onContinue }: ServiceSelectionProps) {
  const { orderType, setOrderType } = useCart();
  const { config } = useDevice();
  const availableServiceOptions = serviceOptions.filter(option => config?.settings.allowedOrderTypes.includes(option.id));
  const { language, direction } = useLanguage();
  const translation = useCustomerTranslation().serviceSelection;
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<OrderType | null>(null);
  const selectingRef = useRef(false);
  const navigationTimerRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  const handleServiceSelect = (type: OrderType) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    setSelected(type);
    setOrderType(type);
    navigationTimerRef.current = window.setTimeout(onContinue, reducedMotion ? 100 : 420);
  };

  const handleBack = () => {
    window.clearTimeout(navigationTimerRef.current);
    selectingRef.current = false;
    setSelected(null);
    onBack();
  };

  const BackArrow = direction === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: selected ? 0 : 1 }} transition={{ duration: reducedMotion ? .1 : .38 }}
      className="relative isolate min-h-[100dvh] overflow-hidden bg-[#0b1009] font-['DM_Sans'] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_8%,rgba(215,255,122,.13),transparent_29%),radial-gradient(circle_at_85%_88%,rgba(151,104,55,.18),transparent_34%),linear-gradient(155deg,#12180f,#080b08_63%,#151d10)]" aria-hidden="true" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:64px_64px]" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1080px] flex-col px-5 py-[clamp(1.5rem,4vh,4rem)] sm:px-9 lg:px-14">
        <header className="flex items-center justify-between gap-4">
          <button type="button" onClick={handleBack} aria-label={translation.back} className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#d7ff7a] sm:px-5">
            <BackArrow size={19} aria-hidden="true" /><span>{translation.back}</span>
          </button>
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} dir="ltr">
            <MorrowLogo variant="full" priority className="h-auto w-[clamp(8.5rem,22vw,12rem)]" />
          </motion.div>
        </header>

        <section className="my-auto py-[clamp(1.5rem,4vh,4rem)] text-center" aria-labelledby="service-heading">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .06 }}>
            <span className="font-['Space_Mono'] text-[10px] font-bold uppercase tracking-[.32em] text-[#d7ff7a] sm:text-xs">{translation.eyebrow}</span>
            <h1 id="service-heading" className="mx-auto mt-4 max-w-3xl text-[clamp(2.35rem,5.5vw,4.8rem)] font-bold leading-[1.08] tracking-[-.05em]">{translation.title}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-[clamp(1rem,2vw,1.3rem)] text-white/55">{translation.subtitle}</p>
          </motion.div>

          <div className="mx-auto mt-[clamp(2rem,5vh,4.5rem)] grid w-full max-w-3xl gap-[clamp(1rem,2.2vh,2rem)] landscape:max-w-4xl landscape:grid-cols-2">
            {availableServiceOptions.map((option, index) => {
              const isSelected = selected === option.id;
              const wasRestored = !selected && orderType === option.id;
              const Icon = option.id === "dine_in" ? UtensilsCrossed : Package;
              return (
                <motion.button key={option.id} type="button" onClick={() => handleServiceSelect(option.id)} disabled={selectingRef.current && !isSelected}
                  aria-label={`${translation[option.titleKey]}. ${translation[option.descriptionKey]}`} aria-pressed={isSelected || wasRestored}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} animate={{ opacity: selected && !isSelected ? .42 : 1, y: 0, scale: isSelected && !reducedMotion ? 1.018 : 1 }} transition={{ duration: .45, delay: reducedMotion ? 0 : .14 + index * .1 }}
                  className="group relative flex min-h-[clamp(11rem,22vh,20rem)] w-full items-center gap-[clamp(1.25rem,3vw,2.5rem)] overflow-hidden rounded-[clamp(1.6rem,3vw,2.5rem)] border border-white/10 bg-white/[.055] p-[clamp(1.4rem,3.5vh,3rem)] text-start shadow-[0_24px_70px_rgba(0,0,0,.2)] backdrop-blur-md transition-colors hover:border-[#d7ff7a]/45 hover:bg-white/[.09] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#d7ff7a] active:scale-[.985] disabled:cursor-wait landscape:min-h-[clamp(14rem,48vh,24rem)] landscape:flex-col landscape:justify-center landscape:text-center">
                  <span className={`grid size-[clamp(5rem,11vw,8rem)] shrink-0 place-items-center rounded-[2rem] border transition ${isSelected ? "border-[#d7ff7a] bg-[#d7ff7a] text-[#17200f]" : "border-[#d7ff7a]/25 bg-[#d7ff7a]/10 text-[#d7ff7a] group-hover:bg-[#d7ff7a]/15"}`}>
                    {isSelected ? <Check className="size-10" strokeWidth={3} aria-hidden="true" /> : <Icon className="size-[clamp(2.3rem,5vw,4rem)]" strokeWidth={1.6} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 landscape:flex-none"><strong className="block text-[clamp(1.6rem,3.5vw,2.5rem)] font-bold">{translation[option.titleKey]}</strong><span className="mt-2 block text-[clamp(.9rem,1.7vw,1.15rem)] leading-relaxed text-white/48">{translation[option.descriptionKey]}</span>{isSelected && <span className="mt-3 block text-xs font-bold uppercase tracking-wider text-[#d7ff7a]">{translation.selected}</span>}</span>
                  {!isSelected && <ChevronRight className={`ms-auto shrink-0 text-white/20 transition group-hover:text-[#d7ff7a] ${direction === "rtl" ? "rotate-180" : ""} landscape:absolute landscape:bottom-7 landscape:end-7`} size={28} aria-hidden="true" />}
                </motion.button>
              );
            })}
          </div>
        </section>

        <footer className="flex items-center justify-center gap-3 text-center font-['Space_Mono'] text-[9px] uppercase tracking-[.2em] text-white/28 sm:text-[10px]"><Languages size={14} aria-hidden="true" />{translation.footer}<span className="rounded-full border border-white/10 px-2 py-1 text-[#d7ff7a]">{language.toUpperCase()}</span></footer>
      </div>
    </motion.main>
  );
}
