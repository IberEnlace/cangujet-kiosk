import type { OrderType } from "../context/CartContext";

export interface ServiceOption {
  id: OrderType;
  titleKey: "dineInTitle" | "takeAwayTitle";
  descriptionKey: "dineInDescription" | "takeAwayDescription";
}

export const serviceOptions: readonly ServiceOption[] = [
  { id: "dine_in", titleKey: "dineInTitle", descriptionKey: "dineInDescription" },
  { id: "take_away", titleKey: "takeAwayTitle", descriptionKey: "takeAwayDescription" },
] as const;

export function isOrderType(value: string | null): value is OrderType {
  return value === "dine_in" || value === "take_away";
}
