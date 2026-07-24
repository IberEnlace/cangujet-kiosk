import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyProductImageFallback, getProductIdImage, normalizeImagePath, resolveProductImage } from "./productImageResolver";

const adminSource = readFileSync("src/app/pages/Dashboard.tsx", "utf8");
const seedSource = readFileSync("scripts/supabase-menu.mjs", "utf8");

test("stable burger, pizza, and pasta products resolve to distinct images", () => {
  const pairs = [
    ["burger-beef-classic", "burger-chicken-spicy", "burger"],
    ["pizza-margherita", "pizza-chicken-bbq", "pizza"],
    ["pasta-chicken-alfredo", "pasta-arrabbiata", "pasta"],
  ] as const;
  for (const [first, second, category] of pairs) {
    const firstImage = resolveProductImage({ id: first, category, image: `/images/products/${category}.png` });
    const secondImage = resolveProductImage({ id: second, category, image: `/images/products/${category}.png` });
    assert.notEqual(firstImage, secondImage);
    assert.equal(firstImage, getProductIdImage(first));
    assert.equal(secondImage, getProductIdImage(second));
  }
});

test("a product-specific image wins, followed by ID and category fallbacks", () => {
  assert.equal(resolveProductImage({ id: "burger-beef-classic", category: "burger", image: "/custom/beef.webp" }), "/custom/beef.webp");
  assert.equal(resolveProductImage({ id: "burger-beef-classic", category: "burger", image: "" }), "/images/products/burger%20(2).png");
  assert.equal(resolveProductImage({ id: "unknown", category: "pizza", image: "" }), "/images/products/pizza.png");
});

test("image paths normalize safely without public duplication or Windows paths", () => {
  assert.equal(normalizeImagePath("public/images/products/example.png"), "/images/products/example.png");
  assert.equal(normalizeImagePath("/products/example.webp"), "/products/example.webp");
  assert.equal(normalizeImagePath("https://cdn.example.test/example.webp"), "https://cdn.example.test/example.webp");
  assert.equal(normalizeImagePath("C:\\images\\example.png"), "");
  assert.equal(normalizeImagePath("undefined"), "");
});

test("Admin rows use stable product identity, accessible names, and one-shot fallback", () => {
  assert.match(adminSource, /<tr key=\{p\.id\}/);
  assert.match(adminSource, /alt=\{product\.name\}/);
  const image = { dataset: {}, src: "/broken.webp" } as unknown as HTMLImageElement;
  applyProductImageFallback(image, { id: "unknown", category: "pizza" });
  assert.equal(image.src, "/images/products/pizza.png");
  image.src = "/changed-after-fallback.webp";
  applyProductImageFallback(image, { id: "unknown", category: "burger" });
  assert.equal(image.src, "/changed-after-fallback.webp");
});

test("seed reads exact generated image references and preserves custom values", () => {
  assert.match(seedSource, /productImages\.generated\.json/);
  assert.match(seedSource, /preserveProductSpecificImage/);
  assert.match(seedSource, /repairImages/);
  assert.match(seedSource, /update\(\{ image_url: generated \}\)\.eq\("id", product\.id\)/);
  assert.match(seedSource, /existingProduct\.get\(product\.id\)\?\.image_url/);
  assert.match(seedSource, /upsert\("products", products, "id"\)/);
});
