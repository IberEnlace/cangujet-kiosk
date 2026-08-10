import { useMemo, useState } from "react";
import {
  ShoppingCart as CartIcon, Trash2, Plus, Minus, Tag, Ticket,
  ChevronRight, ArrowLeft, Clock, FileText, Heart, RefreshCw,
  Check, X, AlertCircle, Package, ChevronDown, ChevronUp
} from "lucide-react";
import { useCart, type CartItem } from "../context/CartContext";
import CangujetLogo from "../components/branding/CangujetLogo";
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
    <div className="flex min-h-[100dvh] flex-col bg-[#F8F9FA] text-[#1F1F1F]">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#ECECEC] bg-white/95 px-6 py-4 shadow-sm backdrop-blur-xl">
        <button
          onClick={() => onNavigate("main")}
          className="group flex items-center gap-2 text-[#6B7280] transition-colors hover:text-[#1F1F1F]"
        >
          <span className="flex size-9 items-center justify-center rounded-xl border border-[#ECECEC] bg-white shadow-sm transition-all group-hover:border-[#C41E19]/25 group-hover:bg-[#F8F9FA]">
            <ArrowLeft size={16} />
          </span>
          <span className="text-sm">Continue Shopping</span>
        </button>
        <div className="flex items-center gap-3">
          <CangujetLogo variant="symbol" className="size-8 object-contain" alt="" />
          <CartIcon size={20} className="text-[#C41E19]" />
          <h1 className="font-bold text-lg tracking-tight">Your Cart</h1>
          <span className="flex size-6 items-center justify-center rounded-full bg-[#C41E19] text-xs font-bold text-white">
            {items.reduce((s, i) => s + i.qty, 0)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#6B7280]">
          <Clock size={14} />
          <span>~{estimatedMinutes} min</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-0 max-w-[1080px] mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Left: Cart Items */}
        <div className="flex-1 lg:pr-8 flex flex-col gap-6">

          {/* Order Type Pill */}
          <div className="flex w-fit items-center gap-2 rounded-2xl border border-[#ECECEC] bg-white p-1 shadow-sm">
            {(["dine_in", "take_away"] as const).map(type => (
              <button
                key={type}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${orderType === type ? "bg-[#C41E19] text-white shadow-sm" : "text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"}`}
              >
                {type === "dine_in" ? "🍽 Eat Here" : "🛍 Take Away"}
              </button>
            ))}
          </div>

          {/* Empty State */}
          {isCartEmpty && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-6 text-center">
              <div className="flex size-24 items-center justify-center rounded-2xl border border-[#ECECEC] bg-white shadow-sm">
                <CartIcon size={36} className="text-[#9CA3AF]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#1F1F1F]">Your cart is empty</h2>
                <p className="mt-2 text-sm text-[#6B7280]">Add items from the menu to get started</p>
              </div>
              <button
                onClick={() => onNavigate("main")}
                className="flex items-center gap-2 rounded-xl bg-[#C41E19] px-8 py-3 font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:translate-y-0 active:scale-[.98]"
              >
                Browse Menu <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Cart Items */}
          {!isCartEmpty && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#6B7280]">Items ({items.reduce((s, i) => s + i.qty, 0)})</h2>
                <button onClick={clearCart} className="flex items-center gap-1 rounded-xl border border-[#C41E19]/25 bg-white px-3 py-2 text-xs text-[#C41E19] transition-colors hover:bg-[#C41E19] hover:text-white">
                  <Trash2 size={12} /> Clear all
                </button>
              </div>

              {items.map(item => (
                <div
                  key={item.id}
                  className={`group flex items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${deletingId === item.id ? "scale-95 opacity-0" : "scale-100 opacity-100"} duration-300`}
                >
                  <div className="relative">
                    <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover" />
                    <div className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#C41E19] text-xs font-bold text-white">
                      {item.qty}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                    {(selectedModifierLabels(item).length > 0 || item.customizations && Object.keys(item.customizations).length > 0) && (
                      <p className="mt-0.5 truncate text-xs text-[#6B7280]">
                        {(selectedModifierLabels(item).length ? selectedModifierLabels(item) : Object.values(item.customizations ?? {})).join(" · ")}
                      </p>
                    )}
                    {(incompleteLines.has(item.id) || lineErrors[item.id]) && <div className="mt-2"><p role="alert" className="text-xs text-[#C41E19]">{lineErrors[item.id] ?? incompleteLines.get(item.id)}</p><button type="button" onClick={() => editItem(item)} className="mt-1 text-xs font-bold text-[#C41E19] underline underline-offset-4">Edit required choices</button></div>}
                    {item.calories && (
                      <p className="mt-0.5 text-xs text-[#9CA3AF]">{item.calories * item.qty} cal</p>
                    )}
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-1">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="flex size-8 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-white hover:text-[#1F1F1F]"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="flex size-8 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-white hover:text-[#C41E19]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="text-right min-w-[70px]">
                    <p className="font-bold text-[#C41E19]">{currency.format(item.price * item.qty)}</p>
                    <p className="text-xs text-[#9CA3AF]">{currency.format(item.price)} each</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => saveForLater(item.id)}
                      className="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"
                      title="Save for later"
                    >
                      <Heart size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="flex size-8 items-center justify-center rounded-lg border border-transparent text-[#9CA3AF] transition-colors hover:border-[#C41E19] hover:bg-white hover:text-[#C41E19]"
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
                className="mb-3 flex items-center gap-2 text-sm text-[#6B7280] transition-colors hover:text-[#1F1F1F]"
              >
                {showSaved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Saved for later ({savedItems.length})
              </button>
              {showSaved && (
                <div className="flex flex-col gap-2">
                  {savedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-sm">
                      <img src={item.image} alt={item.name} className="size-14 rounded-xl object-cover opacity-60" />
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-[#1F1F1F]">{item.name}</h3>
                        <p className="text-xs text-[#9CA3AF]">{currency.format(item.price)}</p>
                      </div>
                      <button
                        onClick={() => moveToCart(item.id)}
                        className="flex items-center gap-1.5 rounded-xl border border-[#ECECEC] bg-white px-3 py-1.5 text-xs text-[#1F1F1F] shadow-sm transition-all hover:border-[#C41E19]/25 hover:bg-[#F8F9FA] hover:text-[#C41E19]"
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
          <div className="rounded-2xl border border-[#ECECEC] bg-white shadow-sm">
            <button
              onClick={() => setNoteOpen(!noteOpen)}
              className="w-full flex items-center justify-between p-4 text-sm"
            >
              <div className="flex items-center gap-2 text-[#6B7280]">
                <FileText size={16} />
                <span>Order Notes</span>
                {orderNotes && <span className="size-2 rounded-full bg-[#C41E19]" />}
              </div>
              {noteOpen ? <ChevronUp size={14} className="text-[#9CA3AF]" /> : <ChevronDown size={14} className="text-[#9CA3AF]" />}
            </button>
            {noteOpen && (
              <div className="px-4 pb-4">
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Any special requests? (e.g., extra sauce, no onions, allergies...)"
                  className="w-full resize-none rounded-xl border border-[#ECECEC] bg-white p-3 text-sm text-[#1F1F1F] transition placeholder:text-[#9CA3AF] focus:border-[#C41E19] focus:outline-none focus:ring-4 focus:ring-[#C41E19]/10"
                  rows={3}
                />
              </div>
            )}
          </div>

        </div>

        {/* Right: Order Summary */}
        <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col gap-4">

          {/* Coupon / Promo */}
          <div className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-sm transition hover:shadow-md">
            <button
              onClick={() => setExpandedSection(expandedSection === "coupon" ? null : "coupon")}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-[#F8F9FA]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-[#C41E19]/8">
                  <Tag size={15} className="text-[#C41E19]" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Coupon & Promo Code</p>
                  {coupon && <p className="text-xs text-[#C41E19]">{coupon.code} applied</p>}
                </div>
              </div>
              {expandedSection === "coupon" ? <ChevronUp size={14} className="text-[#9CA3AF]" /> : <ChevronDown size={14} className="text-[#9CA3AF]" />}
            </button>
            {expandedSection === "coupon" && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                {coupon ? (
                  <div className="flex items-center justify-between rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/5 p-3">
                    <div>
                      <p className="text-sm font-bold text-[#C41E19]">{coupon.code}</p>
                      <p className="text-xs text-[#6B7280]">{coupon.description}</p>
                    </div>
                    <button onClick={removeCoupon} className="flex size-7 items-center justify-center rounded-lg border border-[#C41E19]/20 bg-white text-[#C41E19] transition-colors hover:bg-[#C41E19] hover:text-white">
                      <X size={12} />
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
                        className="min-h-11 flex-1 rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm uppercase tracking-wider text-[#1F1F1F] placeholder:text-[#9CA3AF] focus:border-[#C41E19] focus:outline-none focus:ring-4 focus:ring-[#C41E19]/10"
                      />
                      <button
                        onClick={handleCoupon}
                        className="rounded-xl bg-[#C41E19] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#A8161A] active:scale-[.98]"
                      >
                        Apply
                      </button>
                    </div>
                    {couponError && (
                      <p className="flex items-center gap-1.5 text-xs text-[#C41E19]">
                        <AlertCircle size={12} /> {couponError}
                      </p>
                    )}
                    {couponSuccess && (
                      <p className="flex items-center gap-1.5 text-xs text-[#C41E19]">
                        <Check size={12} /> Coupon applied successfully!
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["NORI20", "WELCOME10", "SUMMER5"].map(code => (
                        <button
                          key={code}
                          onClick={() => { setCouponInput(code); }}
                          className="rounded-lg border border-[#ECECEC] bg-white px-2.5 py-1 font-mono text-[10px] text-[#6B7280] transition-all hover:border-[#C41E19]/25 hover:bg-[#F8F9FA] hover:text-[#C41E19]"
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
          <div className="flex flex-col gap-3 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Package size={16} className="text-[#6B7280]" />
              <h3 className="font-semibold text-sm">Order Summary</h3>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between text-[#6B7280]">
                <span>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</span>
                <span>{currency.format(authoritativeSubtotal)}</span>
              </div>

              {coupon && (
                <div className="flex justify-between text-[#C41E19]">
                  <span className="flex items-center gap-1.5"><Ticket size={12} /> {coupon.code}</span>
                  <span>-{currency.format(coupon.type === "percent" ? subtotal * coupon.discount / 100 : coupon.discount)}</span>
                </div>
              )}

              <div className="flex justify-between text-[#6B7280]">
                <span>Tax ({Math.round((branch?.taxRate ?? 0) * 100)}%)</span>
                <span>{currency.format(authoritativeTax)}</span>
              </div>

              <div className="flex justify-between text-[#6B7280]">
                <span className="flex items-center gap-1.5"><Clock size={12} /> Est. time</span>
                <span>~{estimatedMinutes} min</span>
              </div>

              <div className="flex items-baseline justify-between border-t border-[#ECECEC] pt-3">
                <span className="font-bold text-base">Total</span>
                <div className="text-right">
                  <p className="text-2xl font-bold tracking-tight text-[#C41E19]">{currency.format(authoritativeTotal)}</p>
                  {discount > 0 && (
                    <p className="text-xs text-[#9CA3AF] line-through">{currency.format(total + discount)}</p>
                  )}
                </div>
              </div>

              {discount > 0 && (
                <div className="rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/5 px-3 py-2 text-center">
                  <p className="text-xs font-semibold text-[#C41E19]">🎉 You saved {currency.format(discount)} on this order!</p>
                </div>
              )}
            </div>
          </div>

          {/* Checkout Button */}
          {checkoutError && <p role="alert" className="rounded-xl border border-[#C41E19]/25 bg-white p-3 text-sm text-[#C41E19]">{checkoutError}</p>}
          <button
            onClick={() => void proceedToCheckout()}
            disabled={isCartEmpty || orderSubmission.isBusy || incompleteLines.size > 0}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
              isCartEmpty || incompleteLines.size > 0
                ? "cursor-not-allowed border border-[#ECECEC] bg-[#F8F9FA] text-[#9CA3AF]"
                : "bg-[#C41E19] text-white shadow-[0_8px_20px_rgba(196,30,25,.18)] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:translate-y-0 active:scale-[0.98]"
            }`}
          >
            {orderSubmission.isBusy ? "Validating order…" : "Proceed to Checkout"}
            <ChevronRight size={20} />
          </button>

          <button
            onClick={() => onNavigate("main")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ECECEC] bg-white py-3 text-sm font-semibold text-[#1F1F1F] shadow-sm transition-all hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]"
          >
            <ArrowLeft size={16} /> Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
}
