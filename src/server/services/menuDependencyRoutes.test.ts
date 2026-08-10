import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import type { Database } from "../../lib/supabase/database.types";
import { createMenuRouter } from "../routes/menuRoutes";

test("Categories and Products classify Supabase transport failures as safe 503 responses", async () => {
  const client = failingClient({
    name: "PostgrestError",
    code: "",
    message: "TypeError: fetch failed",
    details: "Caused by: connect EACCES",
  });
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    await withServer(client, async baseUrl => {
      for (const route of ["categories", "products"]) {
        const response = await fetch(`${baseUrl}/api/${route}`, {
          headers: { authorization: "Bearer staff.access.token" },
        });
        assert.equal(response.status, 503);
        assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
        assert.deepEqual(await response.json(), { error: `${route === "categories" ? "Categories" : "Products"} could not be loaded.` });
      }
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(entries.map(entry => (entry[1] as Record<string, unknown>).operation), ["categories_read", "products_read"]);
  assert.ok(entries.every(entry => (entry[1] as Record<string, unknown>).dependency === "supabase_rest"));
  assert.ok(entries.every(entry => (entry[1] as Record<string, unknown>).causeCode === "EACCES"));
  assert.doesNotMatch(JSON.stringify(entries), /staff\.access\.token|authorization/i);
});

test("successful menu reads still return the real repository projection", async () => {
  const client = successfulClient();
  await withServer(client, async baseUrl => {
    const categories = await fetch(`${baseUrl}/api/categories`);
    const products = await fetch(`${baseUrl}/api/products`);
    assert.equal(categories.status, 200);
    assert.equal(products.status, 200);
    assert.deepEqual(await categories.json(), []);
    assert.deepEqual(await products.json(), []);
  });
});

function failingClient(error: Record<string, unknown>) {
  return queryClient({ data: null, error });
}

function successfulClient() {
  return queryClient({ data: [], error: null });
}

function queryClient(result: { data: unknown[] | null; error: Record<string, unknown> | null }) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.order = () => query;
  query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

async function withServer(client: SupabaseClient<Database>, action: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use("/api", createMenuRouter(() => client));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    await action(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
