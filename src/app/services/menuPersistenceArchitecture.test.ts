import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("server exposes category and product CRUD routes", () => {
  const source = read("../../server/routes/menuRoutes.ts");
  for (const route of [
    'get("/categories"', 'post("/categories"', 'put("/categories/:id"', 'delete("/categories/:id"',
    'get("/products"', 'post("/products"', 'put("/products/:id"', 'delete("/products/:id"',
  ]) assert.match(source, new RegExp(route.replace(/[(/[.*+?^${}|]/g, "\\$&")));
  assert.match(source, /\.eq\("id", String\(request\.body\.categoryId\)\)/);
  assert.doesNotMatch(source, /SERVICE_ROLE/);
});

test("menu migration preserves the product-category foreign key and persistent fields", () => {
  const initial = read("../../../supabase/migrations/202607230001_initial_restaurant_schema.sql");
  const persistence = read("../../../supabase/migrations/202607260002_menu_persistence_fields.sql");
  assert.match(initial, /category_id uuid not null references public\.categories\(id\)/);
  assert.match(persistence, /categories[\s\S]*icon text/);
  assert.match(persistence, /products[\s\S]*display_order integer/);
  assert.match(persistence, /storage\.buckets[\s\S]*menu-images/);
});

test("Admin, Customer, and Cashier do not use static menu arrays as persistence", () => {
  const admin = read("../pages/Dashboard.tsx");
  const customer = read("../pages/customer/MenuCatalog.tsx");
  const cashier = read("../pages/CashierDashboard.tsx");
  assert.doesNotMatch(admin, /initialProducts|initialCategories|demo state/);
  assert.doesNotMatch(customer, /getLocalMenu|const catalog:/);
  assert.doesNotMatch(cashier, /from "\.\.\/data\/cashierMenu"/);
});

test("menu loader has no silent local fallback", () => {
  const source = read("./supabase/menuService.ts");
  assert.doesNotMatch(source, /Using the complete local menu fallback|return localFallback/);
});
