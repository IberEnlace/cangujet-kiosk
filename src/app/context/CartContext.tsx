import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import type { NoriSelectedCustomization } from "../../server/types/noriChat";
import { isOrderType } from "../config/serviceOptions";
import {
  applyNoriOrderLifecycleEvent,
  initialNoriOrderLifecycle,
  isTerminalPaymentStatus,
  type NoriOrderLifecycleEvent,
  type NoriOrderLifecycleState,
} from "../../shared/noriOrderLifecycle";
import { useBranch } from "./BootstrapContext";
import type { ProductionOrder } from "../../shared/orders";
import { mergeCartItem } from "../services/orders/cartModifierPipeline";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CartItem = {
  id: string;
  productId?: string;
  name: string;
  price: number;
  basePrice: number;
  qty: number;
  image: string;
  category: string;
  customizations?: Record<string, string>;
  noriCustomizations?: NoriSelectedCustomization[];
  selectedModifiers?: CartModifierSelection[];
  requiredModifierGroups?: CartModifierRequirement[];
  noriActionId?: string;
  adjustedNutrition?: NoriSelectedCustomization["nutritionAdjustment"];
  savedForLater?: boolean;
  calories?: number;
};

export type CartModifierSelection = {
  modifierGroupId: string;
  modifierId: string;
  groupName: string;
  optionName: string;
  priceAdjustment: number;
};

export type CartModifierRequirement = {
  modifierGroupId: string;
  name: string;
  minimumSelections: number;
  maximumSelections: number;
  required: boolean;
};

export type OrderType = "dine_in" | "take_away";

export type PaymentMethod =
  | "cash" | "cashier" | "credit" | "debit"
  | "apple-pay" | "google-pay" | "qr"
  | "split" | "gift-card" | "wallet";

export type OrderStatus =
  | "idle" | "received" | "preparing" | "cooking" | "ready" | "completed";
export type PaymentStatus = "pending" | "paid";
export type PreparationStation = "kitchen" | "grill" | "drinks" | "dessert" | "no_preparation";

export type KitchenOrder = {
  id: string;
  number: number;
  databaseStatus?: import("../../shared/orders").ProductionOrderStatus;
  items: { name: string; qty: number; notes?: string; station?: PreparationStation; customizations?: string[]; allergenWarnings?: string[] }[];
  status: OrderStatus;
  priority: boolean;
  delayed: boolean;
  startTime: number;
  completedAt?: number;
  estimatedMinutes: number;
  type: OrderType;
  customer?: string;
  source?: import("../../shared/orders").ProductionOrderSource;
  paymentStatus?: import("../../shared/orders").ProductionPaymentStatus | null;
};

export type UserProfile = {
  name: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  favorites: string[];
  orderHistory: HistoryOrder[];
  achievements: Achievement[];
  birthdate?: string;
  referralCode: string;
  language: string;
  theme: "dark" | "light";
  accessibilityMode: "normal" | "kids" | "senior";
  notifications: boolean;
};

export type HistoryOrder = {
  id: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: "completed" | "cancelled";
  paymentMethod: PaymentMethod;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: number;
  max?: number;
};

export type CouponResult = {
  code: string;
  discount: number;
  type: "percent" | "fixed";
  description: string;
};

// ─── Context Shape ───────────────────────────────────────────────────────────

type CartContextType = {
  providerInstanceId: string;
  // Cart
  items: CartItem[];
  confirmedOrderItems: CartItem[];
  savedItems: CartItem[];
  addItem: (item: Omit<CartItem, "qty">) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  updateCustomizations: (id: string, customizations: Record<string, string>, price: number, calories?: number) => void;
  saveForLater: (id: string) => void;
  moveToCart: (id: string) => void;
  clearCart: () => void;

  // Order
  orderType: OrderType | null;
  setOrderType: (t: OrderType) => void;
  resetOrderType: () => void;
  orderNotes: string;
  setOrderNotes: (n: string) => void;
  coupon: CouponResult | null;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  giftCardBalance: number;
  applyGiftCard: (code: string) => boolean;
  rewardsApplied: number;
  applyRewards: (points: number) => void;

  // Totals
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  estimatedMinutes: number;

  // Payment
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  setPaymentMethod: (m: PaymentMethod) => void;
  orderStatus: OrderStatus;
  setOrderStatus: (s: OrderStatus) => void;
  queueNumber: number;
  currentOrderId: string;
  currentOrderNumber: string;
  currentTrackingToken: string;
  orderLifecycle: NoriOrderLifecycleState;
  transitionOrderLifecycle: (event: NoriOrderLifecycleEvent) => void;
  recordCreatedOrder: (order: { id: string; number: string; total: number; trackingToken?: string }) => void;
  placeOrder: (created?: { id: string; number: string; total: number }) => void;

  // User
  user: UserProfile;
  updateUser: (updates: Partial<UserProfile>) => void;
  toggleFavorite: (itemId: string) => void;
};

// ─── Mock Data ──────────────────────────────────────────────────────────────

const VALID_COUPONS: Record<string, CouponResult> = {
  NORI20: { code: "NORI20", discount: 20, type: "percent", description: "20% off your order" },
  WELCOME10: { code: "WELCOME10", discount: 10, type: "fixed", description: "$10 off welcome discount" },
  SUMMER5: { code: "SUMMER5", discount: 5, type: "fixed", description: "$5 Summer special" },
  VIP30: { code: "VIP30", discount: 30, type: "percent", description: "30% VIP discount" },
};

const initialUser: UserProfile = {
  name: "Alex Morrow",
  email: "alex@morrow.co",
  phone: "+1 (555) 000-0000",
  loyaltyPoints: 2480,
  tier: "gold",
  favorites: ["b1", "s1", "d1"],
  orderHistory: [
    { id: "h1", date: "2026-07-10", items: [{ name: "Spicy Nori Burger", qty: 2, price: 8.9 }, { name: "Rosemary Fries", qty: 1, price: 3.5 }], total: 21.3, status: "completed", paymentMethod: "credit" },
    { id: "h2", date: "2026-07-08", items: [{ name: "Smoky Truffle Beef", qty: 1, price: 10.5 }], total: 11.55, status: "completed", paymentMethod: "apple-pay" },
    { id: "h3", date: "2026-07-05", items: [{ name: "Zen Garden Bowl", qty: 2, price: 7.2 }, { name: "Iced Matcha Latte", qty: 2, price: 4.5 }], total: 25.74, status: "completed", paymentMethod: "google-pay" },
  ],
  achievements: [
    { id: "a1", title: "First Order", description: "Placed your first order", icon: "🎉", unlocked: true },
    { id: "a2", title: "Burger Lover", description: "Order 10 burgers", icon: "🍔", unlocked: true, progress: 10, max: 10 },
    { id: "a3", title: "Gold Member", description: "Reached Gold tier", icon: "🥇", unlocked: true },
    { id: "a4", title: "Streak Master", description: "Order 7 days in a row", icon: "🔥", unlocked: false, progress: 3, max: 7 },
    { id: "a5", title: "Referral King", description: "Refer 5 friends", icon: "👑", unlocked: false, progress: 2, max: 5 },
    { id: "a6", title: "Healthy Eater", description: "Order 5 salads", icon: "🥗", unlocked: false, progress: 1, max: 5 },
  ],
  birthdate: "1995-03-15",
  referralCode: "ALEX2026",
  language: "English",
  theme: "dark",
  accessibilityMode: "normal",
  notifications: true,
};

// ─── Context ─────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextType | null>(null);

function readStored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

function readSessionOrderType(): OrderType | null {
  try {
    const value = sessionStorage.getItem("morrow_customer_order_type");
    return isOrderType(value) ? value : null;
  } catch { return null; }
}

function readPendingProductionOrder(): ProductionOrder | null {
  try {
    const value = sessionStorage.getItem("morrow:pending-production-order");
    if (!value) return null;
    const parsed = JSON.parse(value) as { order?: ProductionOrder | null };
    return parsed.order?.id && parsed.order.orderNumber ? parsed.order : null;
  } catch { return null; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const branch = useBranch();
  const recoveredOrder = useRef(readPendingProductionOrder()).current;
  const providerInstanceId = useRef(crypto.randomUUID()).current;
  const [items, setItems] = useState<CartItem[]>(() => readStored("morrow_cart", []));
  const [savedItems, setSavedItems] = useState<CartItem[]>([]);
  const [confirmedOrderItems, setConfirmedOrderItems] = useState<CartItem[]>(() => recoveredOrder?.items.map(item => ({
    id: item.productId, name: item.productName, price: Number(item.unitPrice), basePrice: Number(item.unitPrice),
    qty: item.quantity, image: "", category: "", customizations: Object.fromEntries(item.modifiers.map((value, index) => [String(index), value.name])),
  })) ?? []);
  const [orderType, setOrderTypeState] = useState<OrderType | null>(readSessionOrderType);
  const [orderNotes, setOrderNotes] = useState("");
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [giftCardBalance, setGiftCardBalance] = useState(0);
  const [rewardsApplied, setRewardsApplied] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(() =>
    recoveredOrder?.paymentMethod === "card_terminal" ? "credit"
      : recoveredOrder?.paymentMethod === "pay_at_cashier" ? "cashier"
        : recoveredOrder?.paymentMethod === "cash" ? "cash" : null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [createdOrderTotal, setCreatedOrderTotal] = useState<number | null>(() => recoveredOrder ? Number(recoveredOrder.total) : null);
  const [currentTrackingToken, setCurrentTrackingToken] = useState(() => recoveredOrder?.customerReference ?? "");
  const [queueNumber, setQueueNumber] = useState(() => Number(recoveredOrder?.orderNumber.match(/(\d+)$/)?.[1]) || 0);
  const [currentOrderId, setCurrentOrderId] = useState(() => recoveredOrder?.id ?? "");
  const [currentOrderNumber, setCurrentOrderNumber] = useState(() => recoveredOrder?.orderNumber ?? "");
  const [orderLifecycle, setOrderLifecycle] = useState<NoriOrderLifecycleState>(() => initialNoriOrderLifecycle());
  const paymentStatus: PaymentStatus | null = orderLifecycle.paymentStatus === "completed"
    ? "paid"
    : orderLifecycle.paymentStatus === "idle" ? null : "pending";
  const [user, setUser] = useState<UserProfile>(() => readStored("morrow_user_profile", initialUser));
  const cartCorrelationSignature = items
    .map(item => `${item.id}:${item.qty}:${item.price}:${item.selectedModifiers?.map(value => value.modifierId).sort().join(",") ?? item.noriCustomizations?.map(value => value.optionId).sort().join(",") ?? ""}`)
    .sort()
    .join("|");
  const previousCartCorrelationSignature = useRef(cartCorrelationSignature);

  const setOrderType = useCallback((type: OrderType) => {
    setOrderTypeState(type);
    try { sessionStorage.setItem("morrow_customer_order_type", type); } catch { /* Session storage may be unavailable. */ }
  }, []);

  const resetOrderType = useCallback(() => {
    setOrderTypeState(null);
    try { sessionStorage.removeItem("morrow_customer_order_type"); } catch { /* Session storage may be unavailable. */ }
  }, []);

  useEffect(() => { localStorage.setItem("morrow_cart", JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("morrow_user_profile", JSON.stringify(user)); }, [user]);
  useEffect(() => {
    if (previousCartCorrelationSignature.current === cartCorrelationSignature) return;
    previousCartCorrelationSignature.current = cartCorrelationSignature;
    if (!currentOrderId || isTerminalPaymentStatus(orderLifecycle.paymentStatus)) return;
    setCurrentOrderId("");
    setCurrentOrderNumber("");
    setCurrentTrackingToken("");
    setCreatedOrderTotal(null);
    setOrderLifecycle(initialNoriOrderLifecycle());
  }, [cartCorrelationSignature, currentOrderId, orderLifecycle.paymentStatus]);

  // Computed totals
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const taxRate = branch?.taxRate ?? 0;
  const rewardsDiscount = rewardsApplied * 0.01; // 1 point = $0.01
  const couponDiscount = coupon
    ? coupon.type === "percent"
      ? (subtotal * coupon.discount) / 100
      : coupon.discount
    : 0;
  const discount = couponDiscount + rewardsDiscount + giftCardBalance;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * taxRate;
  const calculatedTotal = taxable + tax;
  const total = createdOrderTotal ?? calculatedTotal;
  const estimatedMinutes = Math.max(8, items.reduce((acc, i) => acc + i.qty * 2, 8));

  const addItem = useCallback((item: Omit<CartItem, "qty">) => {
    setItems(prev => {
      if (!hasCompleteStoredModifiers(item)) return prev;
      return mergeCartItem(prev, item);
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) { removeItem(id); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }, [removeItem]);

  const updateCustomizations = useCallback((id: string, customizations: Record<string, string>, price: number, calories?: number) => {
    setItems(previous => previous.map(item => item.id === id
      ? { ...item, customizations, price, calories: calories ?? item.calories }
      : item));
  }, []);

  const saveForLater = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    setSavedItems(prev => [...prev, { ...item, savedForLater: true }]);
    removeItem(id);
  }, [items, removeItem]);

  const moveToCart = useCallback((id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (!item) return;
    setSavedItems(prev => prev.filter(i => i.id !== id));
    addItem({ ...item, savedForLater: false });
  }, [savedItems, addItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    setSavedItems([]);
    setCoupon(null);
    setGiftCardBalance(0);
    setRewardsApplied(0);
    setPaymentMethod(null);
    setOrderStatus("idle");
    setQueueNumber(0);
    setCurrentOrderId("");
    setCurrentOrderNumber("");
    setCurrentTrackingToken("");
    setCreatedOrderTotal(null);
    setConfirmedOrderItems([]);
    setOrderLifecycle(initialNoriOrderLifecycle());
  }, []);

  const applyCoupon = useCallback((code: string): boolean => {
    const result = VALID_COUPONS[code.toUpperCase()];
    if (result) { setCoupon(result); return true; }
    return false;
  }, []);

  const removeCoupon = useCallback(() => setCoupon(null), []);

  const applyGiftCard = useCallback((code: string): boolean => {
    if (code.length >= 8) { setGiftCardBalance(prev => prev + 25); return true; }
    return false;
  }, []);

  const applyRewards = useCallback((points: number) => {
    const maxPoints = Math.min(points, user.loyaltyPoints);
    setRewardsApplied(maxPoints);
  }, [user.loyaltyPoints]);

  const recordCreatedOrder = useCallback((order: { id: string; number: string; total: number; trackingToken?: string }) => {
    setCurrentOrderId(order.id);
    setCurrentOrderNumber(order.number);
    const numeric = Number(order.number.match(/(\d+)$/)?.[1]);
    if (Number.isFinite(numeric)) setQueueNumber(numeric);
    setCreatedOrderTotal(order.total);
    setCurrentTrackingToken(order.trackingToken ?? "");
  }, []);

  const transitionOrderLifecycle = useCallback((event: NoriOrderLifecycleEvent) => {
    setOrderLifecycle(current => {
      const transition = applyNoriOrderLifecycleEvent(current, event);
      if (import.meta.env.DEV) {
        console.debug("[Nori lifecycle]", {
          previousPaymentStatus: current.paymentStatus,
          nextPaymentStatus: event.paymentStatus,
          transitionSource: event.source,
          orderCorrelationId: event.orderId ?? current.orderId,
          ignoredReason: transition.reason,
        });
      }
      return transition.state;
    });
  }, []);

  const placeOrder = useCallback((created?: { id: string; number: string; total: number }) => {
    const effectiveId = created?.id || currentOrderId;
    const effectiveNumber = Number((created?.number || currentOrderNumber).match(/(\d+)$/)?.[1]);
    if (!effectiveId || !Number.isFinite(effectiveNumber)) return;
    if (created) setCreatedOrderTotal(created.total);
    setQueueNumber(effectiveNumber); setCurrentOrderId(effectiveId);
    setOrderStatus("received");
    setConfirmedOrderItems(items.map(item => ({ ...item })));
    setItems([]);
    setSavedItems([]);
  }, [currentOrderId, currentOrderNumber, items]);

  const updateUser = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleFavorite = useCallback((itemId: string) => {
    setUser(prev => ({
      ...prev,
      favorites: prev.favorites.includes(itemId)
        ? prev.favorites.filter(f => f !== itemId)
        : [...prev.favorites, itemId],
    }));
  }, []);

  return (
    <CartContext.Provider value={{
      providerInstanceId,
      items, confirmedOrderItems, savedItems, addItem, removeItem, updateQty, updateCustomizations, saveForLater, moveToCart, clearCart,
      orderType, setOrderType, resetOrderType, orderNotes, setOrderNotes,
      coupon, applyCoupon, removeCoupon,
      giftCardBalance, applyGiftCard,
      rewardsApplied, applyRewards,
      subtotal, tax, discount, total, estimatedMinutes,
      paymentMethod, paymentStatus, setPaymentMethod, orderStatus, setOrderStatus, currentTrackingToken,
      orderLifecycle, transitionOrderLifecycle, recordCreatedOrder,
      queueNumber, currentOrderId, currentOrderNumber, placeOrder,
      user, updateUser, toggleFavorite,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function hasCompleteStoredModifiers(item: Pick<CartItem, "requiredModifierGroups" | "selectedModifiers">) {
  return (item.requiredModifierGroups ?? []).every(group => {
    const count = (item.selectedModifiers ?? [])
      .filter(selection => selection.modifierGroupId === group.modifierGroupId).length;
    return count >= group.minimumSelections
      && (!group.required || count > 0)
      && count <= group.maximumSelections;
  });
}
