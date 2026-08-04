import assert from "node:assert/strict";
import test from "node:test";
import {
  ReportDataError,
  loadReportData,
} from "../../../../supabase/functions/send-notification-email/data/reportData";

const branch = {
  id: "branch-1",
  restaurant_id: "restaurant-1",
  name: "MORROW Main",
  currency: "EUR",
  timezone: "Europe/Istanbul",
};
const start = "2026-08-03T21:00:00.000Z";
const end = "2026-08-04T21:00:00.000Z";

test("successful report load uses the current production order and payment schema", async () => {
  const client = reportClient({
    orders: [order({ id: "paid-1", status: "submitted", total: 20 })],
    order_payments: [payment({ order_id: "paid-1", method: "cash", amount: 20 })],
    order_items: [{ order_id: "paid-1", product_id: "product-1", product_name_snapshot: "Morrow Burger", quantity: 2, line_total: 20 }],
  });
  const result = await loadReportData(client, branch, "daily_sales_report", start, end);
  assert.equal(result.daily.totalOrders, 1);
  assert.equal(result.daily.submittedOrders, 1);
  assert.equal(result.daily.paidOrders, 1);
  assert.deepEqual(result.daily.topProducts, [{ name: "Morrow Burger", quantity: 2, sales: "€20.00" }]);
  const orderQuery = client.queries.find(query => query.table === "orders")!;
  assert.match(orderQuery.columns, /tax_total/);
  assert.match(orderQuery.columns, /service_mode/);
  assert.doesNotMatch(orderQuery.columns, /(^|,)tax(,|$)|order_type/);
  assert.deepEqual(orderQuery.filters.slice(0, 2), [
    ["eq", "restaurant_id", "restaurant-1"],
    ["eq", "branch_id", "branch-1"],
  ]);
});

test("empty report periods return zero metrics without unnecessary child queries", async () => {
  const client = reportClient({ orders: [] });
  const result = await loadReportData(client, branch, "daily_sales_report", start, end);
  assert.equal(result.daily.totalOrders, 0);
  assert.equal(result.daily.paidOrders, 0);
  assert.equal(result.daily.grossSales, "€0.00");
  assert.equal(result.daily.paidSales, "€0.00");
  assert.deepEqual(result.daily.topProducts, []);
  assert.deepEqual(result.daily.payments, []);
  assert.deepEqual(client.queries.map(query => query.table), ["orders"]);
});

test("missing branch scope is rejected before any database query", async () => {
  const client = reportClient({});
  await assert.rejects(
    loadReportData(client, { ...branch, id: "" }, "daily_sales_report", start, end),
    (error: unknown) => error instanceof ReportDataError
      && error.code === "report_branch_required"
      && error.source === "branch",
  );
  assert.equal(client.queries.length, 0);
});

test("database failures log only safe Supabase diagnostics and retain a stable public error", async () => {
  const client = reportClient({}, {
    orders: { code: "42703", message: "column orders.tax does not exist", details: "PostgREST select failed", hint: "Use tax_total" },
  });
  const diagnostics: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => { diagnostics.push(values); };
  try {
    await assert.rejects(
      loadReportData(client, branch, "daily_sales_report", start, end),
      (error: unknown) => error instanceof ReportDataError
        && error.code === "report_data_unavailable"
        && error.source === "orders",
    );
  } finally {
    console.error = original;
  }
  assert.equal(diagnostics[0][0], "[MORROW notifications] report data query failed");
  assert.deepEqual(diagnostics[0][1], {
    source: "orders",
    code: "42703",
    message: "column orders.tax does not exist",
    details: "PostgREST select failed",
    hint: "Use tax_total",
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /authorization|apikey|token/i);
});

test("paid sales use captured order payments rather than unpaid order totals", async () => {
  const client = reportClient({
    orders: [
      order({ id: "captured", total: 30, status: "completed" }),
      order({ id: "unpaid", total: 70, status: "awaiting_payment", payment_status: "unpaid" }),
    ],
    order_payments: [payment({ order_id: "captured", method: "card_terminal", amount: 30 })],
    order_items: [{ order_id: "captured", product_id: "p1", product_name_snapshot: "Paid Product", quantity: 1, line_total: 30 }],
  });
  const result = await loadReportData(client, branch, "daily_sales_report", start, end);
  assert.equal(result.daily.grossSales, "€100.00");
  assert.equal(result.daily.paidSales, "€30.00");
  assert.equal(result.daily.totalSales, "€30.00");
  assert.deepEqual(result.daily.payments, [{ label: "Card Terminal", count: 1, total: "€30.00" }]);
});

test("cancelled orders and their captured payments are excluded from revenue and top products", async () => {
  const client = reportClient({
    orders: [
      order({ id: "valid", total: 15, status: "submitted" }),
      order({ id: "cancelled", total: 90, status: "cancelled", cancelled_at: "2026-08-04T10:00:00.000Z" }),
    ],
    order_payments: [
      payment({ order_id: "valid", amount: 15 }),
      payment({ order_id: "cancelled", amount: 90 }),
    ],
    order_items: [
      { order_id: "valid", product_id: "p1", product_name_snapshot: "Valid Product", quantity: 1, line_total: 15 },
      { order_id: "cancelled", product_id: "p2", product_name_snapshot: "Cancelled Product", quantity: 9, line_total: 90 },
    ],
  });
  const result = await loadReportData(client, branch, "daily_sales_report", start, end);
  assert.equal(result.daily.cancelledOrders, 1);
  assert.equal(result.daily.grossSales, "€15.00");
  assert.equal(result.daily.paidSales, "€15.00");
  assert.deepEqual(result.daily.topProducts.map(product => product.name), ["Valid Product"]);
});

test("report boundaries are half-open UTC instants rendered as the branch-local business date", async () => {
  const client = reportClient({
    orders: [
      order({ id: "before", created_at: "2026-08-03T20:59:59.999Z" }),
      order({ id: "at-start", created_at: start }),
      order({ id: "before-end", created_at: "2026-08-04T20:59:59.999Z" }),
      order({ id: "at-end", created_at: end }),
    ],
    order_payments: [],
  });
  const result = await loadReportData(client, branch, "daily_sales_report", start, end);
  assert.equal(result.daily.totalOrders, 2);
  assert.equal(result.daily.localDate, "4 August 2026");
  assert.equal(result.daily.periodStart, start);
  assert.equal(result.daily.periodEnd, end);
  const orderQuery = client.queries.find(query => query.table === "orders")!;
  assert.deepEqual(orderQuery.filters.slice(-2), [
    ["gte", "created_at", "2026-08-02T21:00:00.000Z"],
    ["lt", "created_at", end],
  ]);
});

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    restaurant_id: "restaurant-1",
    branch_id: "branch-1",
    status: "submitted",
    payment_status: "paid",
    total: 10,
    tax_total: 1,
    source: "kiosk",
    service_mode: "dine_in",
    created_at: "2026-08-04T10:00:00.000Z",
    placed_at: "2026-08-04T10:05:00.000Z",
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "order-1",
    method: "cash",
    status: "captured",
    amount: 10,
    captured_at: "2026-08-04T10:01:00.000Z",
    refunded_at: null,
    created_at: "2026-08-04T10:00:30.000Z",
    ...overrides,
  };
}

type SafeError = { code?: string; message?: string; details?: string; hint?: string };

function reportClient(
  rows: Record<string, Array<Record<string, unknown>>>,
  errors: Record<string, SafeError> = {},
) {
  const queries: FakeQuery[] = [];
  return {
    queries,
    from(table: string) {
      const query = new FakeQuery(table, rows[table] ?? [], errors[table] ?? null);
      queries.push(query);
      return query;
    },
  };
}

class FakeQuery {
  columns = "";
  filters: Array<[string, string, unknown]> = [];

  constructor(
    readonly table: string,
    private readonly rows: Array<Record<string, unknown>>,
    private readonly error: SafeError | null,
  ) {}

  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push(["eq", column, value]); return this; }
  gte(column: string, value: unknown) { this.filters.push(["gte", column, value]); return this; }
  lt(column: string, value: unknown) { this.filters.push(["lt", column, value]); return this; }
  in(column: string, value: unknown[]) { this.filters.push(["in", column, value]); return this; }

  then(resolve: (value: { data: Array<Record<string, unknown>> | null; error: SafeError | null }) => unknown, reject?: (reason: unknown) => unknown) {
    const data = this.error ? null : this.rows.filter(row => this.filters.every(([operator, column, value]) => {
      if (operator === "eq") return row[column] === value;
      if (operator === "gte") return String(row[column]) >= String(value);
      if (operator === "lt") return String(row[column]) < String(value);
      if (operator === "in") return (value as unknown[]).includes(row[column]);
      return true;
    }));
    return Promise.resolve({ data, error: this.error }).then(resolve, reject);
  }
}
