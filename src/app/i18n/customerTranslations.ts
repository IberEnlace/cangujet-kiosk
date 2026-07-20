import type { SupportedLanguage } from "../config/languages";

export const customerTranslations = {
  en: {
    languageSelection: { eyebrow: "Welcome to Morrow", title: "Choose your language", subtitle: "Select your preferred language to continue", back: "Back to welcome", selected: "Selected" },
    serviceSelection: { eyebrow: "Service selection", title: "How would you like your order?", subtitle: "Choose your dining option to continue", dineInTitle: "Dine In", dineInDescription: "Enjoy your meal at the restaurant", takeAwayTitle: "Take Away", takeAwayDescription: "Take your order with you", back: "Back", selected: "Selected", footer: "Step 2 of 4 · Next: Menu" },
  },
  tr: {
    languageSelection: { eyebrow: "Morrow'a hoş geldiniz", title: "Dilinizi seçin", subtitle: "Devam etmek için tercih ettiğiniz dili seçin", back: "Karşılama ekranına dön", selected: "Seçildi" },
    serviceSelection: { eyebrow: "Servis seçimi", title: "Siparişinizi nasıl almak istersiniz?", subtitle: "Devam etmek için servis türünü seçin", dineInTitle: "Restoranda", dineInDescription: "Yemeğinizin keyfini restoranda çıkarın", takeAwayTitle: "Paket Servis", takeAwayDescription: "Siparişinizi yanınızda götürün", back: "Geri", selected: "Seçildi", footer: "4 adımın 2.'si · Sonraki: Menü" },
  },
  ar: {
    languageSelection: { eyebrow: "مرحباً بكم في مورو", title: "اختر لغتك", subtitle: "اختر اللغة التي تفضلها للمتابعة", back: "العودة إلى شاشة الترحيب", selected: "تم الاختيار" },
    serviceSelection: { eyebrow: "اختيار الخدمة", title: "كيف ترغب باستلام طلبك؟", subtitle: "اختر نوع الخدمة للمتابعة", dineInTitle: "تناول الطعام هنا", dineInDescription: "استمتع بوجبتك داخل المطعم", takeAwayTitle: "طلب خارجي", takeAwayDescription: "خذ طلبك معك", back: "رجوع", selected: "تم الاختيار", footer: "الخطوة 2 من 4 · التالي: القائمة" },
  },
} as const;

export function getCustomerTranslation(language: SupportedLanguage) {
  return customerTranslations[language] ?? customerTranslations.en;
}
