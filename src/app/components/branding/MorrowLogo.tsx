import fullLogo from "../../../assets/branding/morrow-logo-full.png";
import symbolLogo from "../../../assets/branding/morrow-symbol.png";

export type MorrowLogoVariant = "symbol" | "full";

type MorrowLogoProps = {
  variant?: MorrowLogoVariant;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export default function MorrowLogo({ variant = "full", className = "", alt, priority = false }: MorrowLogoProps) {
  const meaningfulAlt = alt ?? (variant === "full" ? "MORROW" : "MORROW logo");
  return <img src={variant === "full" ? fullLogo : symbolLogo} alt={meaningfulAlt} loading={priority ? "eager" : "lazy"} decoding="async" className={`block max-w-full object-contain  ${className}`} />;
}
