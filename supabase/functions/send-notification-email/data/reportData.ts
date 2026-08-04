import { formatCurrency } from "../utils/formatCurrency.ts";

type Branch = {
  id: string;
  restaurant_id: string;
  name: string;
  currency: string;
  timezone: string;
};

type Order = {
  id: string;
  restaurant_id: string;
  branch_id: string;
  status: string;
  total: number | string;
  tax_total: number | string;
  source: string;
  service_mode: string;
  created_at: string;
  placed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

type Payment = {
  order_id: string;
  method: string;
  status: string;
  amount: number | string;
  captured_at: string | null;
  refunded_at: string | null;
  created_at: string;
};

type QueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type DailyReportData = {
  branchName: string;
  localDate: string;
  periodStart: string;
  periodEnd: string;
  totalSales: string;
  grossSales: string;
  paidSales: string;
  totalOrders: number;
  submittedOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: string;
  paidOrders: number;
  comparison?: { sales: string; orders: string };
  topProducts: Array<{ name: string; quantity: number; sales: string }>;
  payments: Array<{ label: string; count: number; total?: string }>;
  sources: Array<{ label: string; count: number }>;
  attention: string[];
};

export type WeeklyReportData = {
  title: string;
  summary: string;
  rows: Array<[string, string]>;
};

export class ReportDataError extends Error {
  constructor(readonly code: string, readonly source: string) {
    super(code);
    this.name = "ReportDataError";
  }
}

const excludedRevenueStatuses = new Set(["draft", "cancelled", "payment_failed", "rejected"]);
const money = <T>(rows: T[], value: (row: T) => number | string) =>
  rows.reduce((sum, row) => sum + Number(value(row) || 0), 0);
const count = (orders: Order[], field: keyof Order, value: string) =>
  orders.filter(order => order[field] === value).length;
const change = (current: number, previous: number) => previous === 0
  ? current === 0 ? "0%" : "New"
  : `${((current - previous) / previous * 100).toFixed(1)}%`;

export function loadReportData(
  client: any,
  branch: Branch,
  type: "daily_sales_report",
  start: string,
  end: string,
): Promise<{ daily: DailyReportData }>;
export function loadReportData(
  client: any,
  branch: Branch,
  type: "weekly_sales_summary",
  start: string,
  end: string,
): Promise<WeeklyReportData>;
export function loadReportData(
  client: any,
  branch: Branch,
  type: "daily_sales_report" | "weekly_sales_summary",
  start: string,
  end: string,
): Promise<{ daily: DailyReportData } | WeeklyReportData>;
export async function loadReportData(
  client: any,
  branch: Branch,
  type: "daily_sales_report" | "weekly_sales_summary",
  start: string,
  end: string,
) {
  assertReportInput(branch, start, end);
  const duration = Date.parse(end) - Date.parse(start);
  const previousStart = new Date(Date.parse(start) - duration).toISOString();
  const orders = await queryRows<Order>("orders", client.from("orders")
    .select("id,restaurant_id,branch_id,status,total,tax_total,source,service_mode,created_at,placed_at,completed_at,cancelled_at")
    .eq("restaurant_id", branch.restaurant_id)
    .eq("branch_id", branch.id)
    .gte("created_at", previousStart)
    .lt("created_at", end));
  const current = orders.filter(order => order.created_at >= start);
  const previous = orders.filter(order => order.created_at < start);
  const allOrderIds = orders.map(order => order.id);
  const payments = allOrderIds.length
    ? await queryRows<Payment>("order_payments", client.from("order_payments")
      .select("order_id,method,status,amount,captured_at,refunded_at,created_at")
      .in("order_id", allOrderIds))
    : [];

  const currentMetrics = paymentMetrics(current, payments);
  const previousMetrics = paymentMetrics(previous, payments);
  const paidOrderIds = [...currentMetrics.paidOrderIds];
  const items = paidOrderIds.length
    ? await queryRows<any>("order_items", client.from("order_items")
      .select("order_id,product_id,product_name_snapshot,quantity,line_total")
      .in("order_id", paidOrderIds))
    : [];
  const top = new Map<string, { quantity: number; value: number }>();
  for (const item of items) {
    const value = Number(item.line_total || 0);
    const entry = top.get(item.product_name_snapshot) ?? { quantity: 0, value: 0 };
    entry.quantity += Number(item.quantity || 0);
    entry.value += value;
    top.set(item.product_name_snapshot, entry);
  }

  if (type === "daily_sales_report") {
    return {
      daily: buildDailyReport(
        branch,
        start,
        end,
        current,
        previous,
        currentMetrics,
        previousMetrics,
        top,
      ),
    };
  }

  const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
  const products = productIds.length
    ? await queryRows<any>("products", client.from("products")
      .select("id,category_id")
      .in("id", productIds))
    : [];
  const categoryIds = [...new Set(products.map(product => product.category_id).filter(Boolean))];
  const categories = categoryIds.length
    ? await queryRows<any>("categories", client.from("categories")
      .select("id,name")
      .in("id", categoryIds))
    : [];
  const incidents = await queryRows<any>("notification_events", client.from("notification_events")
    .select("event_type")
    .eq("branch_id", branch.id)
    .gte("occurred_at", start)
    .lt("occurred_at", end));
  return buildWeeklyReport(
    branch,
    start,
    end,
    current,
    previous,
    currentMetrics,
    previousMetrics,
    items,
    products,
    categories,
    incidents,
    top,
  );
}

function buildDailyReport(
  branch: Branch,
  start: string,
  end: string,
  current: Order[],
  previous: Order[],
  currentMetrics: ReturnType<typeof paymentMetrics>,
  previousMetrics: ReturnType<typeof paymentMetrics>,
  top: Map<string, { quantity: number; value: number }>,
): DailyReportData {
  const unpaid = currentMetrics.revenueOrders.filter(order => !currentMetrics.paidOrderIds.has(order.id)).length;
  const failed = currentMetrics.payments.filter(payment => payment.status === "failed").length;
  const cancelled = count(current, "status", "cancelled");
  const sourceValues = [
    ["Kiosk", count(currentMetrics.revenueOrders, "source", "kiosk")],
    ["Cashier", count(currentMetrics.revenueOrders, "source", "cashier")],
    ["Nori", count(currentMetrics.revenueOrders, "source", "nori")],
  ] as Array<[string, number]>;
  const attention: string[] = [];
  if (unpaid) attention.push(`${unpaid} ${unpaid === 1 ? "order is" : "orders are"} still unpaid.`);
  if (failed) attention.push(`${failed} ${failed === 1 ? "payment failed" : "payments failed"} today.`);
  if (cancelled) attention.push(`${cancelled} ${cancelled === 1 ? "order was" : "orders were"} cancelled today.`);
  const salesChange = previous.length
    ? Math.round((currentMetrics.paidSales - previousMetrics.paidSales) / previousMetrics.paidSales * 100)
    : null;
  const orderChange = previous.length ? current.length - previous.length : null;
  return {
    branchName: branch.name,
    localDate: localBusinessDate(end, branch.timezone),
    periodStart: start,
    periodEnd: end,
    totalSales: formatCurrency(currentMetrics.paidSales, branch.currency),
    grossSales: formatCurrency(currentMetrics.grossSales, branch.currency),
    paidSales: formatCurrency(currentMetrics.paidSales, branch.currency),
    totalOrders: current.length,
    submittedOrders: count(current, "status", "submitted"),
    completedOrders: count(current, "status", "completed"),
    cancelledOrders: cancelled,
    averageOrderValue: formatCurrency(
      currentMetrics.revenueOrders.length
        ? currentMetrics.grossSales / currentMetrics.revenueOrders.length
        : 0,
      branch.currency,
    ),
    paidOrders: currentMetrics.paidOrderIds.size,
    comparison: salesChange === null || !Number.isFinite(salesChange) || orderChange === null
      ? undefined
      : {
        sales: `${salesChange >= 0 ? "+" : ""}${salesChange}%`,
        orders: `${orderChange >= 0 ? "+" : ""}${orderChange}`,
      },
    topProducts: [...top.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 3)
      .map(([name, value]) => ({
        name,
        quantity: value.quantity,
        sales: formatCurrency(value.value, branch.currency),
      })),
    payments: [...currentMetrics.methods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([method, value]) => ({
        label: paymentMethodLabel(method),
        count: value.count,
        total: formatCurrency(value.total, branch.currency),
      })),
    sources: sourceValues
      .filter(([, value]) => value > 0)
      .map(([label, value]) => ({ label, count: value })),
    attention,
  };
}

function buildWeeklyReport(
  branch: Branch,
  start: string,
  end: string,
  current: Order[],
  previous: Order[],
  currentMetrics: ReturnType<typeof paymentMetrics>,
  previousMetrics: ReturnType<typeof paymentMetrics>,
  items: any[],
  products: any[],
  categories: any[],
  incidents: any[],
  top: Map<string, { quantity: number; value: number }>,
): WeeklyReportData {
  const categoryByProduct = new Map<string, string>(products.map(product => [
    String(product.id),
    String(categories.find(category => category.id === product.category_id)?.name || "Uncategorized"),
  ]));
  const categorySales = new Map<string, number>();
  for (const item of items) {
    const category = categoryByProduct.get(item.product_id) || "Uncategorized";
    categorySales.set(category, (categorySales.get(category) || 0) + Number(item.line_total || 0));
  }
  const topProducts = [...top.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10)
    .map(([name, value]) => `${name} (${value.quantity}, ${formatCurrency(value.value, branch.currency)})`)
    .join("; ") || "No sales";
  const bucket = new Map<string, { orders: number; value: number }>();
  for (const order of currentMetrics.revenueOrders) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: branch.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(order.created_at));
    const value = bucket.get(key) ?? { orders: 0, value: 0 };
    value.orders += 1;
    value.value += Number(order.total);
    bucket.set(key, value);
  }
  const trend = [...bucket.entries()]
    .sort()
    .map(([key, value]) => `${key}: ${value.orders} / ${formatCurrency(value.value, branch.currency)}`)
    .join("; ") || "No orders";
  const busiest = [...bucket.entries()].sort((a, b) => b[1].orders - a[1].orders)[0];
  const paymentMethods = [...currentMetrics.methods.entries()]
    .map(([method, value]) => `${paymentMethodLabel(method)} ${value.count} / ${formatCurrency(value.total, branch.currency)}`)
    .join(" · ") || "No captured payments";
  const rows: Array<[string, string]> = [
    ["Period", `${start} — ${end}`],
    ["Gross order value", formatCurrency(currentMetrics.grossSales, branch.currency)],
    ["Paid sales", formatCurrency(currentMetrics.paidSales, branch.currency)],
    ["Tax total", formatCurrency(money(currentMetrics.revenueOrders, order => order.tax_total), branch.currency)],
    ["Total orders", String(current.length)],
    ["Submitted / Completed / Cancelled", `${count(current, "status", "submitted")} / ${count(current, "status", "completed")} / ${count(current, "status", "cancelled")}`],
    ["Average order value", formatCurrency(currentMetrics.revenueOrders.length ? currentMetrics.grossSales / currentMetrics.revenueOrders.length : 0, branch.currency)],
    ["Payment methods", paymentMethods],
    ["Sources", `Kiosk ${count(currentMetrics.revenueOrders, "source", "kiosk")} · Cashier ${count(currentMetrics.revenueOrders, "source", "cashier")} · Nori ${count(currentMetrics.revenueOrders, "source", "nori")}`],
    ["Service modes", `Dine-in ${count(currentMetrics.revenueOrders, "service_mode", "dine_in")} · Takeaway ${count(currentMetrics.revenueOrders, "service_mode", "take_away")}`],
    ["Top products", topProducts],
    ["Daily trend", trend],
    ["Previous period comparison", `Paid sales ${change(currentMetrics.paidSales, previousMetrics.paidSales)} · Orders ${change(current.length, previous.length)}`],
    ["Best sales day / busiest period", busiest ? `${busiest[0]} (${formatCurrency(busiest[1].value, branch.currency)})` : "No sales"],
    ["Category sales", [...categorySales.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => `${name} ${formatCurrency(value, branch.currency)}`).join("; ") || "No sales"],
    ["Operational incidents", ["order_failure", "payment_failure", "kiosk_offline", "kitchen_display_offline", "device_sync_failure"].map(event => `${event.replace(/_/g, " ")} ${incidents.filter(item => item.event_type === event).length}`).join(" · ")],
  ];
  return {
    title: "Weekly Sales Summary",
    summary: `Authoritative weekly operational sales summary in ${branch.timezone}.`,
    rows,
  };
}

function paymentMetrics(orders: Order[], allPayments: Payment[]) {
  const revenueOrders = orders.filter(order => !excludedRevenueStatuses.has(order.status));
  const revenueOrderIds = new Set(revenueOrders.map(order => order.id));
  const payments = allPayments.filter(payment => revenueOrderIds.has(payment.order_id));
  const captured = payments.filter(payment => payment.status === "captured");
  const paidOrderIds = new Set(captured.map(payment => payment.order_id));
  const methods = new Map<string, { count: number; total: number }>();
  for (const payment of captured) {
    const value = methods.get(payment.method) ?? { count: 0, total: 0 };
    value.count += 1;
    value.total += Number(payment.amount || 0);
    methods.set(payment.method, value);
  }
  return {
    revenueOrders,
    payments,
    paidOrderIds,
    methods,
    grossSales: money(revenueOrders, order => order.total),
    paidSales: money(captured, payment => payment.amount),
  };
}

async function queryRows<T>(source: string, query: PromiseLike<{ data: T[] | null; error: QueryError | null }>) {
  const { data, error } = await query;
  if (error) {
    console.error("[MORROW notifications] report data query failed", {
      source,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new ReportDataError("report_data_unavailable", source);
  }
  return data ?? [];
}

function assertReportInput(branch: Branch, start: string, end: string) {
  if (!branch?.id || !branch.restaurant_id || !branch.name || !branch.currency || !branch.timezone) {
    throw new ReportDataError("report_branch_required", "branch");
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new ReportDataError("report_period_invalid", "period");
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: branch.timezone }).format(new Date(endMs));
  } catch {
    throw new ReportDataError("report_timezone_invalid", "branch");
  }
}

function localBusinessDate(end: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.parse(end) - 1));
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "Cash",
    pay_at_cashier: "Pay at Cashier",
    card_terminal: "Card Terminal",
    qr: "QR",
  };
  return labels[method] ?? method.replace(/_/g, " ");
}
