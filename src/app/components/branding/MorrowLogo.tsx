import cangujetLogo from "../../../assets/branding/cangujet-logo.png";
import { useRestaurant } from "../../context/BootstrapContext";

export type CangujetLogoVariant = "symbol" | "full";

type CangujetLogoProps = {
  variant?: CangujetLogoVariant;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export default function CangujetLogo({ variant = "full", className = "", alt, priority = false }: CangujetLogoProps) {
  const restaurant = useRestaurant();
  const restaurantName = restaurant?.name ?? "cangujet kiosk";
  const meaningfulAlt = alt ?? (variant === "full" ? restaurantName : `${restaurantName} logo`);
  const configuredLogo = restaurant?.logoUrl;
  return <img src={configuredLogo || cangujetLogo} alt={meaningfulAlt} loading={priority ? "eager" : "lazy"} decoding="async" className={`block max-w-full object-contain  ${className}`} />;
}
