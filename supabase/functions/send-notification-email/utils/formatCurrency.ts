export function formatCurrency(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}
