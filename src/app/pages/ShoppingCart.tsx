import { useMemo, useState } from "react";
import {
  ShoppingCart as CartIcon, Trash2, Plus, Minus, Tag, Ticket,
  ChevronRight, ArrowLeft, Clock, FileText, Heart, RefreshCw,
  Check, X, AlertCircle, Package, ChevronDown, ChevronUp
} from "lucide-react";
import { useCart, type CartItem } from "../context/CartContext";
import MorrowLogo from "../components/branding/MorrowLogo";
import { useBootstrap } from "../context/BootstrapContext";
import { useCurrentOrder, useOrderSubmission } from "../context/OrderContext";
import { OrderClientError } from "../services/orders/OrderService";
import {
  cartLineForValidationError,
  requiredModifierProblems,
  selectedModifierLabels,
} from "../services/orders/cartModifierPipeline";

type Props = { onNavigate: (route: string) => void };

export default function ShoppingCart({ onNavigate }: Props) {
  const {
    items, savedItems, updateQty, removeItem, saveForLater, moveToCart, clearCart,
    orderType, orderNotes, setOrderNotes,
    coupon, applyCoupon, removeCoupon,
    subtotal, tax, discount, total, estimatedMinutes,
  } = useCart();
  const { branch, menu } = useBootstrap();
  const productionOrder = useCurrentOrder();
  const orderSubmission = useOrderSubmission();
  const [checkoutError, setCheckoutError] = useState("");
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const currency = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: branch?.currency ?? "USD",
  }), [branch?.currency]);

  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState(false);
  const [showSaved, setShowSaved] = useState(savedItems.length > 0);
  const [expandedSection, setExpandedSection] = useState<string | null>("coupon");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const handleCoupon = () => {
    setCouponError("");
    if (!couponInput.trim()) { setCouponError("Please enter a coupon code"); return; }
    const ok = applyCoupon(couponInput);
    if (ok) { setCouponSuccess(true); setCouponInput(""); setTimeout(() => setCouponSuccess(false), 3000); }
    else { setCouponError("Invalid or expired coupon code"); }
  };

  const handleDeleteItem = (id: string) => {
    setDeletingId(id);
    setTimeout(() => { removeItem(id); setDeletingId(null); }, 300);
  };

  const isCartEmpty = items.length === 0;
  const incompleteLines = useMemo(() => new Map(items.flatMap(item => {
    const problems = requiredModifierProblems(item, menu);
    return problems.length ? [[item.id, problems.map(value => value.message).join(" ")] as const] : [];
  })), [items, menu]);
  const authoritativeSubtotal = productionOrder.quote ? Number(productionOrder.quote.subtotal) : subtotal;
  const authoritativeTax = productionOrder.quote ? Number(productionOrder.quote.taxTotal) : tax;
  const authoritativeTotal = productionOrder.quote ? Number(productionOrder.quote.total) : total;

  const proceedToCheckout = async () => {
    if (isCartEmpty || orderSubmission.isBusy || incompleteLines.size) {
      setLineErrors(Object.fromEntries(incompleteLines));
      return;
    }
    setCheckoutError("");
    setLineErrors({});
    try {
      await orderSubmission.quoteCart();
      onNavigate("payment");
    } catch (error) {
      if (error instanceof OrderClientError) {
        const item = cartLineForValidationError(items, error.itemIndex, error.productId);
        if (item) setLineErrors({ [item.id]: error.message });
      }
      setCheckoutError(error instanceof Error ? error.message : "The cart could not be validated.");
    }
  };
  const editItem = (item: CartItem) => {
    try { sessionStorage.setItem("morrow:edit-cart-line", item.id); } catch { /* Navigation still works. */ }
    onNavigate("main");
  };

  return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['Plus_Jakarta_Sans'] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => onNavigate("main")}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
        >
          <span className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#d7ff7a]/30 transition-all">
            <ArrowLeft size={16} />
          </span>
          <span className="text-sm">Continue Shopping</span>
        </button>
        <div className="flex items-center gap-3">
          <MorrowLogo variant="symbol" className="size-8 object-contain" alt="" />
          <CartIcon size={20} className="text-[#d7ff7a]" />
          <h1 className="font-bold text-lg tracking-tight">Your Cart</h1>
          <span className="bg-[#d7ff7a] text-[#FFFFFF] text-xs font-bold rounded-full size-6 flex items-center justify-center">
            {items.reduce((s, i) => s + i.qty, 0)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/40">
          <Clock size={14} />
          <span>~{estimatedMinutes} min</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-0 max-w-[1080px] mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Left: Cart Items */}
        <div className="flex-1 lg:pr-8 flex flex-col gap-6">

          {/* Order Type Pill */}
          <div className="flex items-center gap-2 p-1 bg-white/[0.04] border border-white/10 rounded-2xl w-fit">
            {(["dine_in", "take_away"] as const).map(type => (
              <button
                key={type}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${orderType === type ? "bg-[#d7ff7a] text-[#FFFFFF]" : "text-white/50 hover:text-white"}`}
              >
                {type === "dine_in" ? "🍽 Eat Here" : "🛍 Take Away"}
              </button>
            ))}
          </div>

          {/* Empty State */}
          {isCartEmpty && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-6 text-center">
              <div className="size-24 rounded-3xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                <CartIcon size={36} className="text-white/20" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white/60">Your cart is empty</h2>
                <p className="text-white/30 text-sm mt-2">Add items from the menu to get started</p>
              </div>
              <button
                onClick={() => onNavigate("main")}
                className="flex items-center gap-2 bg-[#d7ff7a] text-[#FFFFFF] font-bold px-8 py-3 rounded-2xl hover:bg-[#c8f060] transition-all"
              >
                Browse Menu <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Cart Items */}
          {!isCartEmpty && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-white/80 text-sm uppercase tracking-wider">Items ({items.reduce((s, i) => s + i.qty, 0)})</h2>
                <button onClick={clearCart} className="text-xs text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1">
                  <Trash2 size={12} /> Clear all
                </button>
              </div>

              {items.map(item => (
                <div
                  key={item.id}
                  className={`group flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-white/15 transition-all ${deletingId === item.id ? "opacity-0 scale-95" : "opacity-100 scale-100"} duration-300`}
                >
                  <div className="relative">
                    <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover" />
                    <div className="absolute -top-1 -right-1 bg-[#d7ff7a] text-[#FFFFFF] text-xs font-bold rounded-full size-5 flex items-center justify-center">
                      {item.qty}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                    {(selectedModifierLabels(item).length > 0 || item.customizations && Object.keys(item.customizations).length > 0) && (
                      <p className="text-xs text-white/40 mt-0.5 truncate">
                        {(selectedModifierLabels(item).length ? selectedModifierLabels(item) : Object.values(item.customizations ?? {})).join(" · ")}
                      </p>
                    )}
                    {(incompleteLines.has(item.id) || lineErrors[item.id]) && <div className="mt-2"><p role="alert" className="text-xs text-red-300">{lineErrors[item.id] ?? incompleteLines.get(item.id)}</p><button type="button" onClick={() => editItem(item)} className="mt-1 text-xs font-bold text-[#d7ff7a] underline underline-offset-4">Edit required choices</button></div>}
                    {item.calories && (
                      <p className="text-xs text-white/30 mt-0.5">{item.calories * item.qty} cal</p>
                    )}
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="size-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="size-8 flex items-center justify-center rounded-lg hover:bg-[#d7ff7a]/10 transition-colors text-white/60 hover:text-[#d7ff7a]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="text-right min-w-[70px]">
                    <p className="font-bold text-[#d7ff7a]">{currency.format(item.price * item.qty)}</p>
                    <p className="text-xs text-white/30">{currency.format(item.price)} each</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => saveForLater(item.id)}
                      className="size-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                      title="Save for later"
                    >
                      <Heart size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="size-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors text-white/40 hover:text-red-400"
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Saved For Later */}
          {savedItems.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-3"
              >
                {showSaved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Saved for later ({savedItems.length})
              </button>
              {showSaved && (
                <div className="flex flex-col gap-2">
                  {savedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <img src={item.image} alt={item.name} className="size-14 rounded-xl object-cover opacity-60" />
                      <div className="flex-1">
                        <h3 className="font-medium text-sm text-white/60">{item.name}</h3>
                        <p className="text-xs text-white/30">{currency.format(item.price)}</p>
                      </div>
                      <button
                        onClick={() => moveToCart(item.id)}
                        className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-[#d7ff7a]/20 hover:text-[#d7ff7a] px-3 py-1.5 rounded-xl transition-all"
                      >
                        <RefreshCw size={12} /> Move to cart
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Order Notes */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/8">
            <button
              onClick={() => setNoteOpen(!noteOpen)}
              className="w-full flex items-center justify-between p-4 text-sm"
            >
              <div className="flex items-center gap-2 text-white/60">
                <FileText size={16} />
                <span>Order Notes</span>
                {orderNotes && <span className="size-2 rounded-full bg-[#d7ff7a]" />}
              </div>
              {noteOpen ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            {noteOpen && (
              <div className="px-4 pb-4">
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Any special requests? (e.g., extra sauce, no onions, allergies...)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:border-[#d7ff7a]/30 transition-colors"
                  rows={3}
                />
              </div>
            )}
          </div>

        </div>

        {/* Right: Order Summary */}
        <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col gap-4">

          {/* Coupon / Promo */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden">
            <button
              onClick={() => setExpandedSection(expandedSection === "coupon" ? null : "coupon")}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-[#d7ff7a]/10 flex items-center justify-center">
                  <Tag size={15} className="text-[#d7ff7a]" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Coupon & Promo Code</p>
                  {coupon && <p className="text-xs text-[#d7ff7a]">{coupon.code} applied</p>}
                </div>
              </div>
              {expandedSection === "coupon" ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            {expandedSection === "coupon" && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                {coupon ? (
                  <div className="flex items-center justify-between bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-bold text-[#d7ff7a]">{coupon.code}</p>
                      <p className="text-xs text-white/50">{coupon.description}</p>
                    </div>
                    <button onClick={removeCoupon} className="size-6 rounded-lg bg-white/10 hover:bg-red-500/20 flex items-center justify-center transition-colors">
                      <X size={12} className="text-white/60" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={couponInput}
                        onChange={e => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === "Enter" && handleCoupon()}
                        placeholder="Enter code (e.g. NORI20)"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#d7ff7a]/30 placeholder:text-white/25 uppercase tracking-wider"
                      />
                      <button
                        onClick={handleCoupon}
                        className="px-4 py-2.5 bg-[#d7ff7a] text-[#FFFFFF] font-bold text-sm rounded-xl hover:bg-[#c8f060] transition-all"
                      >
                        Apply
                      </button>
                    </div>
                    {couponError && (
                      <p className="flex items-center gap-1.5 text-xs text-red-400">
                        <AlertCircle size={12} /> {couponError}
                      </p>
                    )}
                    {couponSuccess && (
                      <p className="flex items-center gap-1.5 text-xs text-[#d7ff7a]">
                        <Check size={12} /> Coupon applied successfully!
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["NORI20", "WELCOME10", "SUMMER5"].map(code => (
                        <button
                          key={code}
                          onClick={() => { setCouponInput(code); }}
                          className="text-[10px] bg-white/5 hover:bg-[#d7ff7a]/10 hover:text-[#d7ff7a] border border-white/10 px-2.5 py-1 rounded-lg transition-all font-mono"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <Package size={16} className="text-white/40" />
              <h3 className="font-semibold text-sm">Order Summary</h3>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between text-white/60">
                <span>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</span>
                <span>{currency.format(authoritativeSubtotal)}</span>
              </div>

              {coupon && (
                <div className="flex justify-between text-[#d7ff7a]">
                  <span className="flex items-center gap-1.5"><Ticket size={12} /> {coupon.code}</span>
                  <span>-{currency.format(coupon.type === "percent" ? subtotal * coupon.discount / 100 : coupon.discount)}</span>
                </div>
              )}

              <div className="flex justify-between text-white/50">
                <span>Tax ({Math.round((branch?.taxRate ?? 0) * 100)}%)</span>
                <span>{currency.format(authoritativeTax)}</span>
              </div>

              <div className="flex justify-between text-white/50">
                <span className="flex items-center gap-1.5"><Clock size={12} /> Est. time</span>
                <span>~{estimatedMinutes} min</span>
              </div>

              <div className="border-t border-white/10 pt-3 flex justify-between items-baseline">
                <span className="font-bold text-base">Total</span>
                <div className="text-right">
                  <p className="text-2xl font-bold tracking-tight text-[#d7ff7a]">{currency.format(authoritativeTotal)}</p>
                  {discount > 0 && (
                    <p className="text-xs text-white/40 line-through">{currency.format(total + discount)}</p>
                  )}
                </div>
              </div>

              {discount > 0 && (
                <div className="bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-[#d7ff7a] font-semibold">🎉 You saved {currency.format(discount)} on this order!</p>
                </div>
              )}
            </div>
          </div>

          {/* Checkout Button */}
          {checkoutError && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{checkoutError}</p>}
          <button
            onClick={() => void proceedToCheckout()}
            disabled={isCartEmpty || orderSubmission.isBusy || incompleteLines.size > 0}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
              isCartEmpty || incompleteLines.size > 0
                ? "bg-white/5 text-white/20 cursor-not-allowed"
                : "bg-[#d7ff7a] text-[#FFFFFF] hover:bg-[#c8f060] shadow-lg shadow-[#d7ff7a]/20 active:scale-[0.98]"
            }`}
          >
            {orderSubmission.isBusy ? "Validating order…" : "Proceed to Checkout"}
            <ChevronRight size={20} />
          </button>

          <button
            onClick={() => onNavigate("main")}
            className="w-full py-3 rounded-2xl font-semibold text-sm text-white/50 hover:text-white border border-white/8 hover:border-white/20 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} /> Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
}
