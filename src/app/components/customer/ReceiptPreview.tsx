import type { OrderType, PaymentMethod } from "../../context/CartContext";
import type { SupportedLanguage } from "../../config/languages";
import { LANGUAGE_CONFIG } from "../../config/languages";

type Props = { orderNumber: number; date: Date; orderType: OrderType; itemCount: number; total: number; paymentMethod: PaymentMethod; language: SupportedLanguage };

export default function ReceiptPreview({ orderNumber, date, orderType, itemCount, total, paymentMethod, language }: Props) {
  const orderTypeLabel = orderType === "dine_in" ? (language === "tr" ? "Restoranda" : "Dine In") : (language === "tr" ? "Paket" : "Take Away");
  const paymentLabel = paymentMethod === "credit" ? (language === "tr" ? "Kart ile ödendi" : "Paid by card") : paymentMethod === "qr" ? (language === "tr" ? "QR ile ödendi" : "Paid by QR") : (language === "tr" ? "Ödeme kasada yapılacak" : "Payment due at cashier");
  const itemLabel = language === "tr" ? `${itemCount} ürün` : `${itemCount} Item${itemCount === 1 ? "" : "s"}`;
  return <article dir="ltr" className="w-[clamp(15rem,58vw,20rem)] max-h-[38dvh] rotate-[.4deg] bg-[#fffdf7] px-[clamp(1rem,2.4vw,1.5rem)] py-[clamp(.85rem,2dvh,1.25rem)] text-center font-mono text-[#1c211b] shadow-2xl shadow-black/35 [clip-path:polygon(0_0,100%_0,100%_96%,96%_100%,92%_96%,88%_100%,84%_96%,80%_100%,76%_96%,72%_100%,68%_96%,64%_100%,60%_96%,56%_100%,52%_96%,48%_100%,44%_96%,40%_100%,36%_96%,32%_100%,28%_96%,24%_100%,20%_96%,16%_100%,12%_96%,8%_100%,4%_96%,0_100%)]">
    <h3 className="text-lg font-black tracking-[.18em]">MORROW</h3><p className="mt-0.5 text-[9px] text-black/45">{date.toLocaleString(LANGUAGE_CONFIG[language].locale, { dateStyle: "short", timeStyle: "short" })}</p><div className="my-2.5 border-y border-dashed border-black/25 py-2.5"><p className="text-[10px] font-bold tracking-widest">{language === "tr" ? "SİPARİŞ" : "ORDER"}</p><p className="mt-0.5 text-3xl font-black">#{orderNumber}</p></div><div className="space-y-1.5 text-[11px]"><p className="flex justify-between"><span>{itemLabel}</span><span>{orderTypeLabel}</span></p><p className="flex justify-between border-t border-dashed border-black/20 pt-1.5 text-xs font-black"><span>{language === "tr" ? "Toplam" : "Total"}</span><span>{new Intl.NumberFormat(LANGUAGE_CONFIG[language].locale, { style: "currency", currency: "EUR" }).format(total)}</span></p><p className="text-black/55">{paymentLabel}</p></div><p className="mt-3 text-[11px] font-bold">{language === "tr" ? "Teşekkürler!" : "Thank you!"}</p>
  </article>;
}
