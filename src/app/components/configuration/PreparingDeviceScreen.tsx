import { Loader2 } from "lucide-react";
import CangujetLogo from "../branding/CangujetLogo";
import type { SupportedLanguage } from "../../config/languages";

const copy = {
  en: {
    title: "Preparing your device...",
    description: "This will only take a moment.",
  },
  tr: {
    title: "Cihazınız hazırlanıyor...",
    description: "Bu işlem yalnızca kısa bir süre alacaktır.",
  },
} as const;

export default function PreparingDeviceScreen({ language }: { language: SupportedLanguage }) {
  const text = copy[language];

  return <main className="fixed inset-0 z-50 grid min-h-[100dvh] place-items-center bg-[#F8F9FA] px-6 text-[#1F1F1F]">
    <section aria-live="polite" aria-busy="true" className="w-full max-w-md text-center">
      <CangujetLogo variant="full" priority className="mx-auto h-auto w-44" />
      <Loader2 className="mx-auto mt-8 size-7 animate-spin text-[#C41E19]" aria-hidden="true" />
      <h1 className="mt-5 text-2xl font-bold tracking-[-.025em]">{text.title}</h1>
      <p className="mt-2 text-sm text-[#6B7280]">{text.description}</p>
    </section>
  </main>;
}
