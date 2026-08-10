import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Globe2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { supportedLanguages, type SupportedLanguage } from "../../config/languages";
import { useLanguage } from "../../context/LanguageContext";
import { useCustomerTranslation } from "../../hooks/useCustomerTranslation";
import CangujetLogo from "../../components/branding/CangujetLogo";
import { useRestaurant } from "../../context/BootstrapContext";

interface LanguageSelectionProps {
  onBack: () => void;
  onContinue: () => void;
}

export default function LanguageSelection({ onBack, onContinue }: LanguageSelectionProps) {
  const { language, setLanguage, resetLanguage } = useLanguage();
  const restaurant = useRestaurant();
  const availableLanguages = supportedLanguages.filter(option => restaurant?.languages.some(item => item.code === option.code));
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

  const BackArrow = ArrowLeft;
  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: selectedLanguage ? 0 : 1 }} transition={{ duration: reducedMotion ? .1 : .38 }}
      className="relative isolate min-h-[100dvh] overflow-hidden bg-[#F8F9FA] text-[#1F1F1F]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(196,30,25,.045),transparent_32%)]" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1080px] flex-col px-5 py-[clamp(1.5rem,4vh,4rem)] sm:px-9 lg:px-14">
        <header className="flex items-center justify-between">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <CangujetLogo variant="full" priority className="h-auto w-[clamp(8.5rem,22vw,12rem)]" />
          </motion.div>
          <button type="button" onClick={handleBack} className="flex min-h-12 items-center gap-2 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-4 text-sm font-semibold text-[#1F1F1F] shadow-[0_4px_12px_rgba(31,31,31,.05)] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19] sm:px-5" aria-label={translation.back}>
            <BackArrow size={19} aria-hidden="true" /><span className="hidden sm:inline">{translation.back}</span>
          </button>
        </header>

        <section className="my-auto py-10 text-center sm:py-14" aria-labelledby="language-heading">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .08 }}>
            <span className="text-[10px] font-bold uppercase tracking-[.35em] text-[#C41E19] sm:text-xs">{language === "tr" ? `${restaurant?.name ?? ""}'a hoş geldiniz` : `Welcome to ${restaurant?.name ?? ""}`}</span>
            <h1 id="language-heading" className="mt-4 text-[clamp(2.5rem,6vw,5.2rem)] font-bold leading-[1.05] tracking-[-.055em]">{translation.title}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-[clamp(1rem,2vw,1.3rem)] text-[#6B7280]">{translation.subtitle}</p>
          </motion.div>

          <div className="mx-auto mt-[clamp(2rem,5vh,4rem)] grid w-full max-w-3xl gap-[clamp(.75rem,1.8vh,1.5rem)]">
            {availableLanguages.map((option, index) => {
              const isSelected = selectedLanguage === option.code;
              const wasRestored = !selectedLanguage && language === option.code;
              return (
                <motion.button key={option.code} type="button" lang={option.code} dir={option.direction} disabled={selectingRef.current && !isSelected}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0, scale: isSelected && !reducedMotion ? 1.025 : 1 }} transition={{ duration: .45, delay: reducedMotion ? 0 : .16 + index * .08 }}
                  onClick={() => handleLanguageSelect(option.code)} aria-label={`Select ${option.name}`} aria-pressed={isSelected || wasRestored}
                  className="group relative flex min-h-[clamp(7rem,13vh,10rem)] items-center gap-5 overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-[clamp(1rem,2.5vh,2rem)] text-start shadow-[0_8px_24px_rgba(31,31,31,.06)] transition duration-300 hover:-translate-y-1 hover:border-[#C41E19]/30 hover:shadow-[0_14px_32px_rgba(31,31,31,.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C41E19] active:scale-[.985] disabled:cursor-wait">
                  <span className={`grid size-16 shrink-0 place-items-center rounded-full border text-lg font-bold transition sm:size-20 sm:text-xl ${isSelected ? "border-[#C41E19] bg-[#C41E19] text-[#FFFFFF]" : "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19] group-hover:bg-[#C41E19]/10"}`}>
                    {isSelected ? <Check size={27} strokeWidth={3} aria-hidden="true" /> : option.code.toUpperCase()}
                  </span>
                  <span className="min-w-0"><strong className="block text-2xl font-bold sm:text-[1.7rem]">{option.nativeName}</strong>{option.nativeName !== option.name && <span className="mt-1 block text-sm text-[#6B7280]">{option.name}</span>}{isSelected && <span className="mt-2 block text-xs font-bold uppercase tracking-wider text-[#C41E19]">{translation.selected}</span>}</span>
                  {!isSelected && <Globe2 className="ms-auto text-[#9CA3AF] transition group-hover:text-[#C41E19] sm:absolute sm:end-5 sm:top-5" size={20} aria-hidden="true" />}
                </motion.button>
              );
            })}
          </div>
        </section>

        <footer className="text-center text-[9px] uppercase tracking-[.25em] text-[#9CA3AF]">{restaurant?.name} ordering experience</footer>
      </div>
    </motion.main>
  );
}
