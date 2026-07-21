import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Globe2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { supportedLanguages, type SupportedLanguage } from "../../config/languages";
import { useLanguage } from "../../context/LanguageContext";
import { useCustomerTranslation } from "../../hooks/useCustomerTranslation";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";

interface LanguageSelectionProps {
  onBack: () => void;
  onContinue: () => void;
}

export default function LanguageSelection({ onBack, onContinue }: LanguageSelectionProps) {
  const { language, direction, setLanguage, resetLanguage } = useLanguage();
  const { config } = useDevice();
  const availableLanguages = supportedLanguages.filter(option => config?.settings.enabledLanguages.includes(option.code));
  const translation = useCustomerTranslation().languageSelection;
  const reducedMotion = useReducedMotion();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage | null>(null);
  const selectingRef = useRef(false);
  const navigationTimerRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  const handleLanguageSelect = (nextLanguage: SupportedLanguage) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    setSelectedLanguage(nextLanguage);
    setLanguage(nextLanguage);
    navigationTimerRef.current = window.setTimeout(onContinue, reducedMotion ? 100 : 420);
  };

  const handleBack = () => {
    window.clearTimeout(navigationTimerRef.current);
    selectingRef.current = false;
    setSelectedLanguage(null);
    resetLanguage();
    onBack();
  };

  const BackArrow = direction === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: selectedLanguage ? 0 : 1 }} transition={{ duration: reducedMotion ? .1 : .38 }}
      className="relative isolate min-h-[100dvh] overflow-hidden bg-[#0b1009] font-['DM_Sans'] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(215,255,122,.13),transparent_30%),radial-gradient(circle_at_85%_85%,rgba(151,104,55,.18),transparent_34%),linear-gradient(145deg,#12180f,#090c08_65%,#151d10)]" aria-hidden="true" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:64px_64px]" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1080px] flex-col px-5 py-[clamp(1.5rem,4vh,4rem)] sm:px-9 lg:px-14">
        <header className="flex items-center justify-between">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <MorrowLogo variant="full" priority className="h-auto w-[clamp(8.5rem,22vw,12rem)]" />
          </motion.div>
          <button type="button" onClick={handleBack} className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#d7ff7a] sm:px-5" aria-label={translation.back}>
            <BackArrow size={19} aria-hidden="true" /><span className="hidden sm:inline">{translation.back}</span>
          </button>
        </header>

        <section className="my-auto py-10 text-center sm:py-14" aria-labelledby="language-heading">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .08 }}>
            <span className="font-['Space_Mono'] text-[10px] font-bold uppercase tracking-[.35em] text-[#d7ff7a] sm:text-xs">{translation.eyebrow}</span>
            <h1 id="language-heading" className="mt-4 text-[clamp(2.5rem,6vw,5.2rem)] font-bold leading-[1.05] tracking-[-.055em]">{translation.title}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-[clamp(1rem,2vw,1.3rem)] text-white/55">{translation.subtitle}</p>
          </motion.div>

          <div className="mx-auto mt-[clamp(2rem,5vh,4rem)] grid w-full max-w-3xl gap-[clamp(.75rem,1.8vh,1.5rem)]">
            {availableLanguages.map((option, index) => {
              const isSelected = selectedLanguage === option.code;
              const wasRestored = !selectedLanguage && language === option.code;
              return (
                <motion.button key={option.code} type="button" lang={option.code} dir={option.direction} disabled={selectingRef.current && !isSelected}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0, scale: isSelected && !reducedMotion ? 1.025 : 1 }} transition={{ duration: .45, delay: reducedMotion ? 0 : .16 + index * .08 }}
                  onClick={() => handleLanguageSelect(option.code)} aria-label={`Select ${option.name}`} aria-pressed={isSelected || wasRestored}
                  className="group relative flex min-h-[clamp(7rem,13vh,10rem)] items-center gap-5 overflow-hidden rounded-[28px] border border-white/10 bg-white/[.055] p-[clamp(1rem,2.5vh,2rem)] text-start shadow-[0_18px_60px_rgba(0,0,0,.18)] backdrop-blur-md transition-colors hover:border-[#d7ff7a]/45 hover:bg-white/[.09] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#d7ff7a] active:scale-[.985] disabled:cursor-wait">
                  <span className={`grid size-16 shrink-0 place-items-center rounded-full border font-['Space_Mono'] text-lg font-bold transition sm:size-20 sm:text-xl ${isSelected ? "border-[#d7ff7a] bg-[#d7ff7a] text-[#17200f]" : "border-[#d7ff7a]/25 bg-[#d7ff7a]/10 text-[#d7ff7a] group-hover:bg-[#d7ff7a]/15"}`}>
                    {isSelected ? <Check size={27} strokeWidth={3} aria-hidden="true" /> : option.code.toUpperCase()}
                  </span>
                  <span className="min-w-0"><strong className="block text-2xl font-bold sm:text-[1.7rem]">{option.nativeName}</strong>{option.nativeName !== option.name && <span className="mt-1 block text-sm text-white/45">{option.name}</span>}{isSelected && <span className="mt-2 block text-xs font-bold uppercase tracking-wider text-[#d7ff7a]">{translation.selected}</span>}</span>
                  {!isSelected && <Globe2 className="ms-auto text-white/20 transition group-hover:text-[#d7ff7a] sm:absolute sm:end-5 sm:top-5" size={20} aria-hidden="true" />}
                </motion.button>
              );
            })}
          </div>
        </section>

        <footer className="text-center font-['Space_Mono'] text-[9px] uppercase tracking-[.25em] text-white/25">Morrow ordering experience</footer>
      </div>
    </motion.main>
  );
}
