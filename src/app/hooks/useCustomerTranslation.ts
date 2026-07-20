import { useLanguage } from "../context/LanguageContext";
import { getCustomerTranslation } from "../i18n/customerTranslations";

export function useCustomerTranslation() {
  const { language } = useLanguage();
  return getCustomerTranslation(language);
}
