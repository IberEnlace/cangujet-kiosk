import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type { NoriCartItem, NoriSelectedCustomization } from "../types/noriChat";

export type NormalizedNoriCartItem = NoriCartItem & {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  customizations?: Record<string, string>;
  customizationObjects?: NoriSelectedCustomization[];
  actionId?: string;
};

export function normalizeNoriRequestCart(rawCart: unknown): NormalizedNoriCartItem[] {
  if (!Array.isArray(rawCart)) return [];
  return rawCart.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const productId = stringValue(item.productId) ?? stringValue(item.id);
    const quantity = integerValue(item.quantity) ?? integerValue(item.qty);
    if (!productId || quantity === null || quantity < 1 || quantity > 99) return [];
    const documented = noriMenuProducts.find(product => product.id === productId);
    const customizationObjects = normalizeCustomizationObjects(item.customizationObjects)
      ?? normalizeCustomizationObjects(Array.isArray(item.customizations) ? item.customizations : undefined);
    const customizationMap = normalizeCustomizationMap(item.customizations)
      ?? (customizationObjects?.length
        ? Object.fromEntries(customizationObjects.map(customization => [customization.groupId, customization.optionName]))
        : undefined);
    return [{
      productId,
      name: stringValue(item.name) ?? documented?.name ?? productId,
      quantity,
      unitPrice: numberValue(item.unitPrice) ?? numberValue(item.price) ?? documented?.price ?? 0,
      customizations: customizationMap,
      customizationObjects,
    actionId: stringValue(item.actionId) ?? undefined,
    }];
  });
}

function normalizeCustomizationMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] =>
    entry[0].length > 0 && typeof entry[1] === "string" && entry[1].length > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeCustomizationObjects(value: unknown): NoriSelectedCustomization[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid = value.filter((entry): entry is NoriSelectedCustomization => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Partial<NoriSelectedCustomization>;
    return typeof item.productId === "string" && typeof item.groupId === "string"
      && typeof item.optionId === "string" && typeof item.optionName === "string";
  });
  return valid.length ? valid.map(item => ({ ...item })) : undefined;
}

function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function integerValue(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }
