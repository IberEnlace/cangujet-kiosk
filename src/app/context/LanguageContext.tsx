import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLanguageOption, isSupportedLanguage, type SupportedLanguage } from "../config/languages";

const LANGUAGE_STORAGE_KEY = "morrow_customer_language";

interface LanguageContextValue {
  language: SupportedLanguage;
  direction: "ltr" | "rtl";
  setLanguage: (language: SupportedLanguage) => void;
  resetLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function restoreLanguage(): SupportedLanguage {
  try {
    const stored = sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : "en";
  } catch { return "en"; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(restoreLanguage);
  const direction = getLanguageOption(language).direction;

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
    try { sessionStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage may be disabled in kiosk privacy mode. */ }
  }, []);

  const resetLanguage = useCallback(() => {
    setLanguageState("en");
    try { sessionStorage.removeItem(LANGUAGE_STORAGE_KEY); } catch { /* Storage may be disabled in kiosk privacy mode. */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const value = useMemo(() => ({ language, direction, setLanguage, resetLanguage }), [direction, language, resetLanguage, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
