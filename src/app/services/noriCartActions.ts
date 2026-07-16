import type { CartItem } from "../context/CartContext";
import { noriMenuProducts } from "./noriMenuEngine";
import type { NoriAction } from "../../server/types/noriChat";

export type NoriCartActionAdapter = {
  addItem: (item: Omit<CartItem, "qty">) => void;
  updateCustomizations?: (id: string, customizations: Record<string, string>, price: number, calories?: number) => void;
  removeItem?: (id: string) => void;
  updateQty?: (id: string, quantity: number) => void;
  clearCart?: () => void;
};

export function executeNoriCartActions(
  actions: NoriAction[],
  adapter: NoriCartActionAdapter,
): Array<{ actionId: string; status: "success" | "failed"; productId: string }> {
  const results: Array<{ actionId: string; status: "success" | "failed"; productId: string }> = [];
  for (const action of actions) {
    console.log("[NORI][CART_ACTION]");
    console.log("action:", action);
    if (action.type === "clear_cart") {
      if (adapter.clearCart) {
        adapter.clearCart();
        results.push({ actionId: action.actionId, status: "success", productId: "" });
      } else results.push({ actionId: action.actionId, status: "failed", productId: "" });
      continue;
    }
    if (action.type !== "add_to_cart"
      && action.type !== "update_cart_customization"
      && action.type !== "remove_from_cart"
      && action.type !== "update_quantity"
      && action.type !== "replace_cart_item") continue;
    const product = noriMenuProducts.find(item => item.id === action.productId);
    if (!product) {
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
    for (let count = 0; count < action.quantity; count += 1) {
      adapter.addItem({
        id: product.id,
        name: product.name,
        price: product.price + priceAdjustment,
        basePrice: product.price,
        image: product.image,
        category: product.category,
        calories: product.cal + calorieAdjustment,
        customizations: Object.keys(customizations).length ? customizations : undefined,
      });
    }
    results.push({ actionId: action.actionId, status: "success", productId: product.id });
  }
  console.log("[NORI][CART_ACTION]");
  console.log("execution result:", results);
  return results;
}
