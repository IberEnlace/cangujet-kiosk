import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SupabaseDeviceRepository,
  type DeviceMenuScope,
} from "../repositories/deviceRepository";

const scope: DeviceMenuScope = {
  restaurantId: "restaurant-a",
  branchId: "branch-a",
  menuId: "menu-a",
};

test("device menu repository loads categories, products, and modifiers from the assigned published menu", async () => {
  const database = fixture();
  const repository = new SupabaseDeviceRepository(database.client as never);

  const menu = await repository.loadMenuConfiguration(scope);

  assert.equal(menu?.categories[0]?.id, "category-a");
  assert.equal(menu?.products[0]?.id, "product-a");
  assert.equal(menu?.customizationGroups[0]?.id, "group-a");
  assert.equal(menu?.customizationOptions[0]?.id, "option-a");
  assert.deepEqual(database.filters("menu_branches"), [
    ["menu_id", "menu-a"], ["branch_id", "branch-a"], ["is_active", true],
  ]);
  assert.deepEqual(database.filters("menus"), [
    ["id", "menu-a"], ["restaurant_id", "restaurant-a"], ["status", "published"],
  ]);
  assert.deepEqual(database.filters("categories"), [
    ["menu_id", "menu-a"], ["is_active", true], ["is_visible", true],
  ]);
});

test("device menu repository rejects another branch or restaurant and never falls back to global categories", async () => {
  const database = fixture();
  const repository = new SupabaseDeviceRepository(database.client as never);

  assert.equal(await repository.loadMenuConfiguration({ ...scope, branchId: "branch-b" }), null);
  assert.equal(await repository.loadMenuConfiguration({ ...scope, restaurantId: "restaurant-b" }), null);
  assert.equal(database.calls.filter(call => call.table === "categories").length, 0);
});

test("device menu repository returns an empty configuration for a valid menu with no categories", async () => {
  const database = fixture({ categories: [], products: [], groups: [], options: [] });
  const repository = new SupabaseDeviceRepository(database.client as never);

  assert.deepEqual(await repository.loadMenuConfiguration(scope), {
    categories: [],
    products: [],
    customizationGroups: [],
    customizationOptions: [],
  });
});

test("device menu repository does not load an unpublished assigned menu", async () => {
  const database = fixture({ menuStatus: "draft" });
  const repository = new SupabaseDeviceRepository(database.client as never);

  assert.equal(await repository.loadMenuConfiguration(scope), null);
  assert.equal(database.calls.filter(call => call.table === "categories").length, 0);
});

test("schema-drift repair adds and backfills category menu ownership without an unscoped repository fallback", () => {
  const migration = readFileSync(
    "supabase/migrations/202607300004_menu_category_ownership_repair.sql",
    "utf8",
  );
  const repository = readFileSync("src/server/repositories/deviceRepository.ts", "utf8");

  assert.match(migration, /add column if not exists menu_id uuid/);
  assert.match(migration, /where menu_id is null/);
  assert.match(migration, /foreign key \(menu_id\) references public\.menus\(id\) on delete cascade/);
  assert.match(migration, /categories_menu_visibility_idx/);
  assert.match(migration, /restaurant admins manage categories/);
  assert.match(repository, /\.eq\("restaurant_id", scope\.restaurantId\)/);
  assert.match(repository, /\.eq\("branch_id", scope\.branchId\)/);
  assert.match(repository, /\.eq\("menu_id", scope\.menuId\)/);
  assert.doesNotMatch(repository, /categories"\)\s*\.select\("\*"\)\s*\.eq\("is_active"/);
});

type FixtureOptions = {
  menuStatus?: "draft" | "published" | "archived";
  categories?: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
  options?: Record<string, unknown>[];
};

function fixture(options: FixtureOptions = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    menu_branches: [{ menu_id: "menu-a", branch_id: "branch-a", is_active: true }],
    menus: [{
      id: "menu-a", restaurant_id: "restaurant-a",
      status: options.menuStatus ?? "published", version: 3,
    }],
    categories: options.categories ?? [{
      id: "category-a", menu_id: "menu-a", is_active: true, is_visible: true,
      display_order: 0, name: "Burgers",
    }],
    products: options.products ?? [{
      id: "product-a", category_id: "category-a", is_active: true, is_available: true,
      display_order: 0, name: "Burger",
    }],
    product_customization_groups: options.groups ?? [{
      id: "group-a", product_id: "product-a", display_order: 0, name: "Sauce",
    }],
    product_customization_options: options.options ?? [{
      id: "option-a", group_id: "group-a", is_available: true, display_order: 0,
      name: "Mayo",
    }],
  };
  return new FakeDatabase(rows);
}

type QueryCall = {
  table: string;
  equals: [string, unknown][];
  contained: [string, unknown[]][];
};

class FakeDatabase {
  calls: QueryCall[] = [];
  client = {
    from: (table: string) => {
      const call: QueryCall = { table, equals: [], contained: [] };
      this.calls.push(call);
      return new FakeQuery(this.rows[table] ?? [], call);
    },
  };

  constructor(private readonly rows: Record<string, Record<string, unknown>[]>) {}

  filters(table: string) {
    return this.calls.find(call => call.table === table)?.equals ?? [];
  }
}

class FakeQuery implements PromiseLike<{ data: any[]; error: null }> {
  constructor(
    private readonly rows: Record<string, unknown>[],
    private readonly call: QueryCall,
  ) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.call.equals.push([column, value]); return this; }
  in(column: string, values: unknown[]) { this.call.contained.push([column, values]); return this; }
  order() { return this; }

  async maybeSingle() {
    const data = this.filtered();
    return { data: data.length === 1 ? data[0] : null, error: null };
  }

  then<TResult1 = { data: any[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filtered(), error: null }).then(onfulfilled, onrejected);
  }

  private filtered() {
    return this.rows.filter(row =>
      this.call.equals.every(([column, value]) => row[column] === value)
      && this.call.contained.every(([column, values]) => values.includes(row[column])),
    );
  }
}
