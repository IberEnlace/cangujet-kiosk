import fullLogo from "../../../assets/branding/morrow-logo-full.png";
import symbolLogo from "../../../assets/branding/morrow-symbol.png";
import { useRestaurant } from "../../context/BootstrapContext";

export type MorrowLogoVariant = "symbol" | "full";

type MorrowLogoProps = {
  variant?: MorrowLogoVariant;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export default function MorrowLogo({ variant = "full", className = "", alt, priority = false }: MorrowLogoProps) {
  const restaurant = useRestaurant();
  const restaurantName = restaurant?.name ?? "Restaurant";
  const meaningfulAlt = alt ?? (variant === "full" ? restaurantName : `${restaurantName} logo`);
  const configuredLogo = restaurant?.logoUrl;
  return <img src={configuredLogo || (variant === "full" ? fullLogo : symbolLogo)} alt={meaningfulAlt} loading={priority ? "eager" : "lazy"} decoding="async" className={`block max-w-full object-contain  ${className}`} />;
}
