import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import type { NoriSelectedCustomization } from "../../server/types/noriChat";
import { isOrderType } from "../config/serviceOptions";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CartItem = {
  id: string;
  name: string;
  price: number;
  basePrice: number;
  qty: number;
  image: string;
  category: string;
  customizations?: Record<string, string>;
  noriCustomizations?: NoriSelectedCustomization[];
  noriActionId?: string;
  adjustedNutrition?: NoriSelectedCustomization["nutritionAdjustment"];
  savedForLater?: boolean;
  calories?: number;
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
  items: { name: string; qty: number; notes?: string; station?: PreparationStation; customizations?: string[]; allergenWarnings?: string[] }[];
  status: OrderStatus;
  priority: boolean;
  delayed: boolean;
  startTime: number;
  completedAt?: number;
  estimatedMinutes: number;
  type: OrderType;
  customer?: string;
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
  currentTrackingToken: string;
  recordCreatedOrder: (order: { id: string; number: string; total: number; trackingToken?: string }) => void;
  placeOrder: (created?: { id: string; number: string; total: number }) => void;

  // Kitchen orders (demo data)
  kitchenOrders: KitchenOrder[];
  updateKitchenOrderStatus: (id: string, status: OrderStatus) => void;

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

const initialKitchenOrders: KitchenOrder[] = [
  { id: "ko1", number: 42, items: [{ name: "Spicy Nori Burger", qty: 2 }, { name: "Rosemary Fries", qty: 2 }], status: "cooking", priority: true, delayed: false, startTime: Date.now() - 420000, estimatedMinutes: 8, type: "dine_in", customer: "Ahmed" },
  { id: "ko2", number: 43, items: [{ name: "Smoky Truffle Beef", qty: 1 }, { name: "Iced Matcha Latte", qty: 2 }], status: "preparing", priority: false, delayed: false, startTime: Date.now() - 120000, estimatedMinutes: 12, type: "take_away", customer: "Sara" },
  { id: "ko3", number: 44, items: [{ name: "Zen Garden Bowl", qty: 3 }], status: "received", priority: false, delayed: true, startTime: Date.now() - 900000, estimatedMinutes: 15, type: "dine_in", customer: "Mike" },
  { id: "ko4", number: 41, items: [{ name: "Tiny Tenders Combo", qty: 2 }, { name: "Rosemary Fries", qty: 1 }], status: "ready", priority: false, delayed: false, startTime: Date.now() - 600000, estimatedMinutes: 10, type: "take_away", customer: "Lena" },
  { id: "ko5", number: 40, items: [{ name: "Spicy Nori Burger", qty: 1 }], status: "completed", priority: false, delayed: false, startTime: Date.now() - 1200000, estimatedMinutes: 9, type: "dine_in", customer: "Omar" },
  { id: "ko6", number: 45, items: [{ name: "Smoky Truffle Beef", qty: 2 }, { name: "Iced Matcha Latte", qty: 1 }], status: "received", priority: true, delayed: false, startTime: Date.now() - 60000, estimatedMinutes: 11, type: "dine_in", customer: "Nora" },
];

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

function preparationStationForCategory(category: string): PreparationStation {
  const normalized = category.toLowerCase();
  if (normalized.includes("burger")) return "grill";
  if (normalized.includes("drink") || normalized.includes("coffee")) return "drinks";
  if (normalized.includes("dessert")) return "dessert";
  return "kitchen";
}

function readKitchenOrders(): KitchenOrder[] {
  const stored = readStored<Array<Omit<KitchenOrder, "type"> & { type: string }>>("morrow_kitchen_orders", initialKitchenOrders);
  return stored.map(order => ({
    ...order,
    type: isOrderType(order.type) ? order.type : order.type === "take-away" ? "take_away" : "dine_in",
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const providerInstanceId = useRef(crypto.randomUUID()).current;
  const [items, setItems] = useState<CartItem[]>(() => readStored("morrow_cart", [
    { id: "b1", name: "Spicy Nori Burger", price: 8.90, basePrice: 8.90, qty: 2, image: "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=600", category: "burger", calories: 520 },
    { id: "s1", name: "Rosemary Fries", price: 3.50, basePrice: 3.50, qty: 1, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=600", category: "side", calories: 320 },
    { id: "d1", name: "Iced Matcha Latte", price: 4.50, basePrice: 4.50, qty: 1, image: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=600", category: "drink", calories: 150 },
  ]));
  const [savedItems, setSavedItems] = useState<CartItem[]>([]);
  const [orderType, setOrderTypeState] = useState<OrderType | null>(readSessionOrderType);
  const [orderNotes, setOrderNotes] = useState("");
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [giftCardBalance, setGiftCardBalance] = useState(0);
  const [rewardsApplied, setRewardsApplied] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [createdOrderTotal, setCreatedOrderTotal] = useState<number | null>(null);
  const [currentTrackingToken, setCurrentTrackingToken] = useState("");
  const [queueNumber, setQueueNumber] = useState(0);
  const [currentOrderId, setCurrentOrderId] = useState("");
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>(readKitchenOrders);
  const [user, setUser] = useState<UserProfile>(() => readStored("morrow_user_profile", initialUser));

  const setOrderType = useCallback((type: OrderType) => {
    setOrderTypeState(type);
    try { sessionStorage.setItem("morrow_customer_order_type", type); } catch { /* Session storage may be unavailable. */ }
  }, []);

  const resetOrderType = useCallback(() => {
    setOrderTypeState(null);
    try { sessionStorage.removeItem("morrow_customer_order_type"); } catch { /* Session storage may be unavailable. */ }
  }, []);

  useEffect(() => { localStorage.setItem("morrow_cart", JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("morrow_kitchen_orders", JSON.stringify(kitchenOrders)); }, [kitchenOrders]);
  useEffect(() => { localStorage.setItem("morrow_user_profile", JSON.stringify(user)); }, [user]);

  // Computed totals
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const taxRate = 0.10;
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
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, ...item, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
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
    setPaymentStatus(null);
    setOrderStatus("idle");
    setQueueNumber(0);
    setCurrentOrderId("");
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
    const numeric = Number(order.number.match(/(\d+)$/)?.[1]);
    if (Number.isFinite(numeric)) setQueueNumber(numeric);
    setCreatedOrderTotal(order.total);
    setCurrentTrackingToken(order.trackingToken ?? "");
  }, []);

  useEffect(() => { setCreatedOrderTotal(null); }, [items]);

  const placeOrder = useCallback((created?: { id: string; number: string; total: number }) => {
    const num = Math.floor(Math.random() * 50) + 50;
    const id = `ORD-${Date.now().toString().slice(-6)}`;
    const effectiveId = created?.id || currentOrderId || id;
    const effectiveNumber = created ? Number(created.number.match(/(\d+)$/)?.[1]) || num : queueNumber || num;
    if (created) setCreatedOrderTotal(created.total);
    setQueueNumber(effectiveNumber); setCurrentOrderId(effectiveId);
    setOrderStatus("received");
    setPaymentStatus(paymentMethod === "cashier" ? "pending" : "paid");

    // Add to kitchen
    const newOrder: KitchenOrder = {
      id: effectiveId,
      number: effectiveNumber,
      items: items.map(i => ({ name: i.name, qty: i.qty, notes: orderNotes || undefined, customizations: i.customizations ? Object.values(i.customizations) : undefined, station: preparationStationForCategory(i.category) })),
      status: "received",
      priority: false,
      delayed: false,
      startTime: Date.now(),
      estimatedMinutes,
      type: orderType ?? "dine_in",
    };
    setKitchenOrders(prev => [newOrder, ...prev]);

    // Update user points
    const pointsEarned = Math.floor(total * 10);
    setUser(prev => ({
      ...prev,
      loyaltyPoints: prev.loyaltyPoints + pointsEarned,
      orderHistory: [{
        id,
        date: new Date().toISOString().split("T")[0],
        items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        total,
        status: "completed",
        paymentMethod: paymentMethod || "cash",
      }, ...prev.orderHistory],
    }));
  }, [items, orderNotes, estimatedMinutes, orderType, total, paymentMethod, currentOrderId, queueNumber]);

  const updateKitchenOrderStatus = useCallback((id: string, status: OrderStatus) => {
    setKitchenOrders(prev => prev.map(o => o.id === id ? { ...o, status, completedAt: status === "completed" ? Date.now() : undefined } : o));
  }, []);

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
      items, savedItems, addItem, removeItem, updateQty, updateCustomizations, saveForLater, moveToCart, clearCart,
      orderType, setOrderType, resetOrderType, orderNotes, setOrderNotes,
      coupon, applyCoupon, removeCoupon,
      giftCardBalance, applyGiftCard,
      rewardsApplied, applyRewards,
      subtotal, tax, discount, total, estimatedMinutes,
      paymentMethod, paymentStatus, setPaymentMethod, orderStatus, setOrderStatus, currentTrackingToken, recordCreatedOrder,
      queueNumber, currentOrderId, placeOrder,
      kitchenOrders, updateKitchenOrderStatus,
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
