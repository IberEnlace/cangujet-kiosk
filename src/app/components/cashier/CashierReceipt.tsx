import { renderToStaticMarkup } from "react-dom/server";

export interface CashierReceiptItem { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number; customizations?: string[] }
export interface CashierReceiptData { orderNumber: string; date: string; cashierName: string; restaurantName: string; branchName: string; registerName: string; items: CashierReceiptItem[]; subtotal: number; taxRate: number; taxAmount: number; total: number; paymentMethod: "cash" | "card"; amountReceived?: number; change?: number }
export interface CashierReceiptProps { receipt: CashierReceiptData; mode: "preview" | "print" }

const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const rowClass = "flex items-start justify-between gap-4 [font-variant-numeric:tabular-nums]";

function ReceiptItemRow({ item }: { item: CashierReceiptItem }) {
  return <div className="receipt-item py-2 break-inside-avoid">
    <div className={`receipt-line ${rowClass}`}><span className="min-w-0 flex-1 break-words">{item.quantity} × {item.name}</span><strong className="shrink-0 text-right">{money.format(item.lineTotal)}</strong></div>
    <div className="receipt-subline mt-0.5 pl-4 text-[10px] text-black/65"><span>{money.format(item.unitPrice)} each</span></div>
    {item.customizations?.map(customization=><div key={customization} className="receipt-customization mt-0.5 break-words pl-4 text-[10px] text-black/70">• {customization}</div>)}
  </div>;
}

export default function CashierReceipt({ receipt, mode }: CashierReceiptProps) {
  const shell=mode==="preview"?"mx-auto w-full max-w-[400px] bg-white px-5 py-6 text-black shadow-[0_10px_28px_rgba(0,0,0,.18)]":"cashier-receipt-print";
  return <article id={mode==="print"?"cashier-print-receipt":undefined} className={`cashier-receipt font-mono text-[11px] leading-[1.4] [font-variant-numeric:tabular-nums] ${shell}`}>
    <header className="receipt-header text-center"><strong className="receipt-brand block font-sans text-sm font-black tracking-[.28em]">MORROW</strong><div className="mt-1 font-bold">{receipt.restaurantName}</div><div>{receipt.branchName}</div><small className="block text-[10px] text-black/65">{receipt.registerName}</small></header>
    <section className="receipt-meta mt-4 space-y-1 border-t border-dashed border-black/45 pt-3"><div className={rowClass}><span>Order:</span><strong className="text-right">#{receipt.orderNumber}</strong></div><div className={rowClass}><span>Date:</span><span className="text-right">{receipt.date}</span></div><div className={rowClass}><span>Cashier:</span><span className="text-right">{receipt.cashierName}</span></div></section>
    <section className="receipt-items mt-3 border-t border-dashed border-black/45 pt-1">{receipt.items.map(item=><ReceiptItemRow key={item.id} item={item}/>)}</section>
    <section className="receipt-totals mt-2 space-y-1 border-t border-dashed border-black/45 pt-3"><div className={rowClass}><span>Subtotal</span><span className="text-right">{money.format(receipt.subtotal)}</span></div><div className={rowClass}><span>Tax ({Math.round(receipt.taxRate*100)}%)</span><span className="text-right">{money.format(receipt.taxAmount)}</span></div><div className={`receipt-total mt-2 border-t border-dashed border-black/45 pt-2 text-sm font-black ${rowClass}`}><span>TOTAL</span><span className="text-right">{money.format(receipt.total)}</span></div></section>
    <section className="receipt-payment mt-3 space-y-1"><div className={rowClass}><span>Payment:</span><span className="text-right">{receipt.paymentMethod==="cash"?"Cash":"Card"}</span></div>{receipt.amountReceived!==undefined&&<div className={rowClass}><span>Received:</span><span className="text-right">{money.format(receipt.amountReceived)}</span></div>}{receipt.change!==undefined&&<div className={rowClass}><span>Change:</span><span className="text-right">{money.format(receipt.change)}</span></div>}</section>
    <footer className="mt-4 border-t border-dashed border-black/45 pt-3 text-center font-bold">Thank you for your order!</footer>
  </article>;
}

export function printCashierReceipt(receipt: CashierReceiptData): boolean {
  const printWindow=window.open("","_blank","width=420,height=700");
  if(!printWindow)return false;
  const markup=renderToStaticMarkup(<CashierReceipt receipt={receipt} mode="print"/>);
  // For true 80mm output, select an 80mm/Receipt paper size in the printer dialog or use a thermal printer driver.
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${receipt.orderNumber}</title><style>
    *{box-sizing:border-box}html,body{width:80mm;margin:0;padding:0;background:#fff;color:#000;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;line-height:1.4;font-variant-numeric:tabular-nums}.cashier-receipt{width:76mm;margin:0;padding:3mm 2mm;background:#fff;color:#000}.receipt-header{text-align:center}.receipt-brand{display:block;font-family:Arial,sans-serif;font-size:14px;font-weight:800;letter-spacing:3px}.receipt-header div:first-of-type{margin-top:3px;font-weight:700}.receipt-header small{display:block;font-size:10px}.receipt-meta,.receipt-items,.receipt-totals{margin-top:10px;padding-top:7px;border-top:1px dashed #000}.receipt-meta>div,.receipt-totals>div,.receipt-payment>div,.receipt-line{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.receipt-meta span:last-child,.receipt-meta strong,.receipt-line strong,.receipt-totals span:last-child,.receipt-payment span:last-child{flex-shrink:0;margin-left:auto;text-align:right}.receipt-item{padding:5px 0;break-inside:avoid}.receipt-line span{min-width:0;overflow-wrap:anywhere}.receipt-subline,.receipt-customization{padding-left:14px;font-size:10px;overflow-wrap:anywhere}.receipt-total{margin-top:5px;padding-top:5px;border-top:1px dashed #000;font-size:14px;font-weight:800}.receipt-payment{margin-top:9px}.cashier-receipt footer{margin-top:11px;padding-top:8px;border-top:1px dashed #000;text-align:center;font-weight:700}@page{size:80mm auto;margin:0}@media print{html,body{width:80mm;min-height:0}.cashier-receipt{width:76mm;margin:0;padding:3mm 2mm;box-shadow:none;page-break-after:avoid}}
  </style></head><body>${markup}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("afterprint",()=>printWindow.close(),{once:true});
  const startPrint=()=>window.setTimeout(()=>{printWindow.focus();printWindow.print();},100);
  if(printWindow.document.readyState==="complete")startPrint();else printWindow.addEventListener("load",startPrint,{once:true});
  return true;
}
