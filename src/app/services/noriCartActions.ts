import type { CartItem } from "../context/CartContext";
import { noriMenuProducts } from "./noriMenuEngine";
import type { NoriAction, NoriCartItem } from "../../server/types/noriChat";

export type NoriCartActionAdapter = {
  addItem: (item: Omit<CartItem, "qty">) => void;
  updateCustomizations?: (id: string, customizations: Record<string, string>, price: number, calories?: number) => void;
  removeItem?: (id: string) => void;
  updateQty?: (id: string, quantity: number) => void;
  clearCart?: () => void;
};

const defaultExecutedAddActionIds = new Set<string>();

export type NoriCartExecutionOptions = {
  executedActionIds?: Set<string>;
  cartRef?: { current: CartItem[] };
};

export function executeNoriCartActions(
  actions: NoriAction[],
  adapter: NoriCartActionAdapter,
  options: NoriCartExecutionOptions = {},
): Array<{ actionId: string; status: "success" | "failed"; productId: string }> {
  const executedActionIds = options.executedActionIds ?? defaultExecutedAddActionIds;
  const results: Array<{ actionId: string; status: "success" | "failed"; productId: string }> = [];
  for (const action of actions) {
    console.log("[NORI][ACTION_INSPECTION]", {
      type: action.type,
      productId: "productId" in action ? action.productId : undefined,
      actionId: "actionId" in action ? action.actionId : undefined,
    });
    if (action.type === "clear_cart") {
      if (executedActionIds.has(action.actionId)) {
        results.push({ actionId: action.actionId, status: "success", productId: "" });
        continue;
      }
      if (adapter.clearCart) {
        adapter.clearCart();
        executedActionIds.add(action.actionId);
        results.push({ actionId: action.actionId, status: "success", productId: "" });
      } else results.push({ actionId: action.actionId, status: "failed", productId: "" });
      continue;
    }
    if (action.type !== "add_to_cart"
      && action.type !== "update_cart_customization"
      && action.type !== "remove_from_cart"
      && action.type !== "update_quantity"
      && action.type !== "replace_cart_item") continue;
    if (action.type === "add_to_cart" && executedActionIds.has(action.actionId)) {
      results.push({ actionId: action.actionId, status: "success", productId: action.productId });
      continue;
    }
    const product = noriMenuProducts.find(item => item.id === action.productId);
    console.log("[NORI][PRODUCT_LOOKUP]", {
      requested: action.productId,
      availableIds: noriMenuProducts.map(item => item.id),
    });
    if (!product) {
      console.error("[NORI][PRODUCT_RESOLUTION_ERROR]", action.productId);
      results.push({ actionId: action.actionId, status: "failed", productId: action.productId });
      continue;
    }
    const customizations = Object.fromEntries(
      action.customizations.map(value => [value.groupId, value.optionName]),
    );
    const priceAdjustment = action.customizations.reduce((total, customization) => {
      const option = product.customizationGroups
        .find(group => group.id === customization.groupId)?.options
        .find(item => item.id === customization.optionId);
      return total + (option?.priceAdjustment ?? 0);
    }, 0);
    const calorieAdjustment = action.customizations.reduce((total, customization) => {
      const option = product.customizationGroups
        .find(group => group.id === customization.groupId)?.options
        .find(item => item.id === customization.optionId);
      return total + (option?.caloriesAdjustment ?? 0);
    }, 0);
    if (action.type === "update_cart_customization") {
      if (!adapter.updateCustomizations) {
        results.push({ actionId: action.actionId, status: "failed", productId: action.productId });
        continue;
      }
      adapter.updateCustomizations(product.id, customizations, product.price + priceAdjustment, product.cal + calorieAdjustment);
      results.push({ actionId: action.actionId, status: "success", productId: product.id });
      continue;
    }
    if (action.type === "remove_from_cart") {
      if (adapter.removeItem) {
        adapter.removeItem(action.cartItemId ?? product.id);
        results.push({ actionId: action.actionId, status: "success", productId: product.id });
      } else results.push({ actionId: action.actionId, status: "failed", productId: product.id });
      continue;
    }
    if (action.type === "update_quantity") {
      if (adapter.updateQty) {
        adapter.updateQty(action.cartItemId ?? product.id, action.quantity);
        results.push({ actionId: action.actionId, status: "success", productId: product.id });
      } else results.push({ actionId: action.actionId, status: "failed", productId: product.id });
      continue;
    }
    if (action.type === "replace_cart_item") {
      if (!adapter.removeItem) {
        results.push({ actionId: action.actionId, status: "failed", productId: product.id });
        continue;
      }
      const replacement = noriMenuProducts.find(item => item.id === action.replacementProductId);
      if (!replacement) {
        results.push({ actionId: action.actionId, status: "failed", productId: product.id });
        continue;
      }
      adapter.removeItem(action.cartItemId ?? product.id);
      adapter.addItem({
        id: replacement.id, name: replacement.name, price: replacement.price, basePrice: replacement.price,
        image: replacement.image, category: replacement.category, calories: replacement.cal,
      });
      results.push({ actionId: action.actionId, status: "success", productId: replacement.id });
      continue;
    }
    if (action.type !== "add_to_cart") continue;
    console.log("[NORI][EXECUTING_CART_ACTION]", action);
    const mappedItem = mapNoriAddActionToCartItem(action);
    if (!mappedItem) {
      results.push({ actionId: action.actionId, status: "failed", productId: action.productId });
      continue;
    }
    console.log("[NORI][CART_CONTEXT_BEFORE_ADD]", options.cartRef?.current);
    for (let count = 0; count < action.quantity; count += 1) {
      adapter.addItem(mappedItem);
    }
    if (options.cartRef) {
      const nextCart = applyNoriAddActionToCartSnapshot(options.cartRef.current, action);
      if (!nextCart) {
        results.push({ actionId: action.actionId, status: "failed", productId: action.productId });
        continue;
      }
      options.cartRef.current = nextCart;
      console.log("[NORI][CART_REF_AFTER_ADD]", options.cartRef.current);
    }
    executedActionIds.add(action.actionId);
    console.log("[NORI][CART_ACTION_EXECUTED]", action.actionId);
    results.push({ actionId: action.actionId, status: "success", productId: product.id });
  }
  console.log("[NORI][CART_ACTION_RESULT]", results);
  return results;
}

export function mapNoriAddActionToCartItem(
  action: Extract<NoriAction, { type: "add_to_cart" }>,
): Omit<CartItem, "qty"> | null {
  const product = noriMenuProducts.find(item => item.id === action.productId);
  if (!product) {
    console.error("[NORI][PRODUCT_RESOLUTION_ERROR]", action.productId);
    return null;
  }
  const customizations = Object.fromEntries(action.customizations.map(value => [value.groupId, value.optionName]));
  const adjustedNutrition = action.customizations.reduce((nutrition, customization) => ({
    calories: Math.max(0, nutrition.calories + customization.nutritionAdjustment.calories),
    proteinGrams: Math.max(0, nutrition.proteinGrams + customization.nutritionAdjustment.proteinGrams),
    carbohydratesGrams: Math.max(0, nutrition.carbohydratesGrams + customization.nutritionAdjustment.carbohydratesGrams),
    totalFatGrams: Math.max(0, nutrition.totalFatGrams + customization.nutritionAdjustment.totalFatGrams),
    saturatedFatGrams: Math.max(0, nutrition.saturatedFatGrams + customization.nutritionAdjustment.saturatedFatGrams),
    sugarsGrams: Math.max(0, nutrition.sugarsGrams + customization.nutritionAdjustment.sugarsGrams),
    addedSugarsGrams: Math.max(0, nutrition.addedSugarsGrams + customization.nutritionAdjustment.addedSugarsGrams),
    fiberGrams: Math.max(0, nutrition.fiberGrams + customization.nutritionAdjustment.fiberGrams),
    sodiumMilligrams: Math.max(0, nutrition.sodiumMilligrams + customization.nutritionAdjustment.sodiumMilligrams),
    cholesterolMilligrams: Math.max(0, nutrition.cholesterolMilligrams + customization.nutritionAdjustment.cholesterolMilligrams),
  }), product.nutrition);
  return {
    id: product.id, name: product.name, price: action.unitPrice ?? product.price,
    basePrice: product.price, image: product.image, category: product.category,
    calories: adjustedNutrition.calories,
    customizations: Object.keys(customizations).length ? customizations : undefined,
    noriCustomizations: action.customizations.map(item => ({ ...item })),
    noriActionId: action.actionId,
    adjustedNutrition,
  };
}

export function applyNoriAddActionToCartSnapshot(
  items: CartItem[],
  action: Extract<NoriAction, { type: "add_to_cart" }>,
): CartItem[] | null {
  const mapped = mapNoriAddActionToCartItem(action);
  if (!mapped) return null;
  const existing = items.find(item => item.id === mapped.id);
  return existing
    ? items.map(item => item.id === mapped.id ? { ...item, ...mapped, qty: item.qty + action.quantity } : item)
    : [...items, { ...mapped, qty: action.quantity }];
}

export function serializeNoriCart(items: CartItem[]): NoriCartItem[] {
  return items.map(item => ({
    productId: item.id, name: item.name, quantity: item.qty, unitPrice: item.price,
    customizations: item.customizations,
    customizationObjects: item.noriCustomizations,
    actionId: item.noriActionId,
  }));
}
