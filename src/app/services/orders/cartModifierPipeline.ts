import type { OrderQuoteRequest, ProductionServiceMode } from "../../../shared/orders";
import type {
  CartItem,
  CartModifierRequirement,
  CartModifierSelection,
} from "../../context/CartContext";
import type { NormalizedMenu, NormalizedMenuProduct } from "../supabase/menuModels";

export type CartModifierProblem = {
  modifierGroupId: string;
  groupName: string;
  message: string;
};

export function cartLineId(productId: string, modifiers: Pick<CartModifierSelection, "modifierId">[]) {
  const signature = modifiers.map(value => value.modifierId).sort().join(",");
  return signature ? `${productId}::${signature}` : productId;
}

export function defaultModifierSelections(product: NormalizedMenuProduct): Record<string, string[]> {
  return Object.fromEntries(product.customizationGroups.map(group => [
    group.databaseId ?? group.id,
    group.options
      .filter(option => option.available && option.default)
      .slice(0, Math.max(1, group.maxSelections))
      .map(option => option.databaseId ?? option.id),
  ]));
}

export function selectedModifiersForProduct(
  product: NormalizedMenuProduct,
  selections: Record<string, string[]>,
): CartModifierSelection[] {
  return product.customizationGroups.flatMap(group => {
    const groupId = group.databaseId ?? group.id;
    const selectedIds = new Set(selections[groupId] ?? []);
    return group.options
      .filter(option => selectedIds.has(option.databaseId ?? option.id))
      .map(option => ({
        modifierGroupId: groupId,
        modifierId: option.databaseId ?? option.id,
        groupName: group.name,
        optionName: option.name,
        priceAdjustment: option.priceAdjustment,
      }));
  });
}

export function mergeCartItem(
  items: CartItem[],
  item: Omit<CartItem, "qty">,
  quantity = 1,
): CartItem[] {
  const existing = items.find(value => value.id === item.id);
  return existing
    ? items.map(value => value.id === item.id
      ? { ...value, ...item, qty: value.qty + quantity }
      : value)
    : [...items, { ...item, qty: quantity }];
}

export function cartLineForValidationError(
  items: CartItem[],
  itemIndex: number | undefined,
  productId?: string,
) {
  if (itemIndex !== undefined && itemIndex >= 0) return items[itemIndex];
  return productId
    ? items.find(item => productIdForCartItem(item) === productId)
    : undefined;
}

export function requiredModifierProblems(
  item: CartItem,
  menu: NormalizedMenu | null | undefined,
): CartModifierProblem[] {
  const product = menu?.products.find(value => value.id === productIdForCartItem(item));
  const requirements = product
    ? product.customizationGroups.map(group => ({
      modifierGroupId: group.databaseId ?? group.id,
      name: group.name,
      minimumSelections: group.minSelections,
      maximumSelections: group.maxSelections,
      required: group.required,
    }))
    : item.requiredModifierGroups ?? [];
  const modifierIds = new Set(resolveModifierSelections(item, product).map(value => value.modifierGroupId));
  return requirements.flatMap(group => {
    const selectedCount = resolveModifierSelections(item, product)
      .filter(value => value.modifierGroupId === group.modifierGroupId).length;
    const missing = selectedCount < group.minimumSelections || (group.required && !modifierIds.has(group.modifierGroupId));
    if (missing) {
      return [{
        modifierGroupId: group.modifierGroupId,
        groupName: group.name,
        message: `${group.name} requires ${Math.max(1, group.minimumSelections)} selection${group.minimumSelections === 1 ? "" : "s"}.`,
      }];
    }
    if (selectedCount > group.maximumSelections) {
      return [{
        modifierGroupId: group.modifierGroupId,
        groupName: group.name,
        message: `${group.name} has too many selections.`,
      }];
    }
    return [];
  });
}

export function buildOrderQuoteRequest(
  items: CartItem[],
  menu: NormalizedMenu | null | undefined,
  serviceMode: ProductionServiceMode,
  language: string,
  notes: string,
): OrderQuoteRequest {
  const normalizedNotes = notes.trim();
  return {
    items: items.map(item => {
      const product = menu?.products.find(value => value.id === productIdForCartItem(item));
      return {
        productId: productIdForCartItem(item),
        quantity: item.qty,
        modifierIds: resolveModifierSelections(item, product).map(value => value.modifierId),
        ...(normalizedNotes ? { notes: normalizedNotes } : {}),
      };
    }),
    serviceMode,
    language,
    ...(normalizedNotes ? { notes: normalizedNotes } : {}),
  };
}

export function selectedModifierLabels(item: CartItem) {
  return (item.selectedModifiers ?? []).map(value => `${value.groupName}: ${value.optionName}`);
}

export function toModifierRequirements(product: NormalizedMenuProduct): CartModifierRequirement[] {
  return product.customizationGroups.map(group => ({
    modifierGroupId: group.databaseId ?? group.id,
    name: group.name,
    minimumSelections: group.minSelections,
    maximumSelections: group.maxSelections,
    required: group.required,
  }));
}

function resolveModifierSelections(item: CartItem, product?: NormalizedMenuProduct): CartModifierSelection[] {
  if (item.selectedModifiers?.length) {
    if (!product) return item.selectedModifiers;
    return item.selectedModifiers.flatMap(selection => {
      const group = product.customizationGroups.find(value =>
        (value.databaseId ?? value.id) === selection.modifierGroupId);
      const option = group?.options.find(value =>
        value.available && (value.databaseId ?? value.id) === selection.modifierId);
      if (!group || !option) return [];
      return [{
        modifierGroupId: group.databaseId ?? group.id,
        modifierId: option.databaseId ?? option.id,
        groupName: group.name,
        optionName: option.name,
        priceAdjustment: option.priceAdjustment,
      }];
    });
  }
  if (!product || !item.noriCustomizations?.length) return [];
  return item.noriCustomizations.flatMap(selection => {
    const group = product.customizationGroups.find(value => value.id === selection.groupId);
    const option = group?.options.find(value => value.id === selection.optionId);
    if (!group || !option) return [];
    return [{
      modifierGroupId: group.databaseId ?? group.id,
      modifierId: option.databaseId ?? option.id,
      groupName: group.name,
      optionName: option.name,
      priceAdjustment: option.priceAdjustment,
    }];
  });
}

function productIdForCartItem(item: CartItem) {
  if (item.productId) return item.productId;
  return item.id.startsWith("menu-") ? item.id.slice(5).split("::")[0] : item.id.split("::")[0];
}
