import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const projectEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (process.env[name]?.trim() === "") delete process.env[name];
}
loadEnvFile(projectEnvPath);

const mode = process.argv[2];
if (!["seed", "verify", "repair-images"].includes(mode)) throw new Error("Usage: node scripts/supabase-menu.mjs <seed|verify|repair-images>");
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
console.log(`SUPABASE_URL loaded: ${Boolean(url)}`);
console.log(`SUPABASE_SECRET_KEY loaded: ${Boolean(secret)}`);
const missingVariables = [
  !url ? "SUPABASE_URL" : null,
  !secret ? "SUPABASE_SECRET_KEY" : null,
].filter(Boolean);
if (missingVariables.length) {
  throw new Error(`Missing ${missingVariables.join(" and ")} in the project root .env file (${projectEnvPath}). Never place the secret in .env.example or a VITE_ variable.`);
}
const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const catalog = JSON.parse(readFileSync(new URL("../src/app/data/cangujet-menu-ai.json", import.meta.url), "utf8"));
const productImageById = JSON.parse(readFileSync(new URL("../src/app/data/productImages.generated.json", import.meta.url), "utf8"));
validateCatalog(catalog);
if (mode === "seed") await seed(); else if (mode === "repair-images") await repairImages(); else await verify();

async function repairImages() {
  const remote = await select("products", "id,image_url");
  const repaired = [];
  const preserved = [];
  for (const product of remote) {
    const generated = productImageById[product.id];
    if (!generated) continue;
    if (product.image_url && (product.image_url === generated || !isCategoryPlaceholder(product.image_url))) {
      preserved.push(product.id);
      continue;
    }
    const { error } = await client.from("products").update({ image_url: generated }).eq("id", product.id);
    if (error) throw new Error(`products image repair failed for ${product.id}: ${error.message}`);
    repaired.push(product.id);
  }
  console.log(JSON.stringify({ repaired, preserved, repairedCount: repaired.length, preservedCount: preserved.length }, null, 2));
}

async function seed() {
  const activeBranches = await select("branches", "currency,is_active");
  const branchCurrencies = [...new Set(activeBranches.filter(row => row.is_active).map(row => row.currency))];
  if (branchCurrencies.length !== 1) throw new Error(`Menu seed requires exactly one active branch currency; found ${branchCurrencies.length}.`);
  const menuCurrency = branchCurrencies[0];
  const beforeCategories = await select("categories", "id,slug,image_url");
  const beforeProducts = await select("products", "id,image_url");
  const existingProduct = new Map(beforeProducts.map(product => [product.id, product]));
  const categoryRows = catalog.categories.map((category, index) => {
    const categorySlug = slug(category);
    const existing = beforeCategories.find(row => row.slug === categorySlug);
    return {
      name: title(category),
      slug: categorySlug,
      description: null,
      image_url: existing?.image_url || defaultCategoryImage(categorySlug),
      icon: "",
      display_order: index,
      is_active: true,
    };
  });
  await upsert("categories", categoryRows, "slug");
  const categories = await select("categories", "id,slug");
  const categoryId = new Map(categories.map(row => [row.slug, row.id]));
  const products = catalog.products.map((product, productIndex) => ({
    id: product.id, category_id: categoryId.get(slug(product.category)), name: product.name, slug: slug(product.id),
    description: product.description, price: product.price, currency: menuCurrency,
    image_url: preserveProductSpecificImage(existingProduct.get(product.id)?.image_url, productImageById[product.id] ?? product.image),
    calories: product.nutrition.calories, protein: product.nutrition.proteinGrams, carbohydrates: product.nutrition.carbohydratesGrams,
    fat: product.nutrition.totalFatGrams, fiber: product.nutrition.fiberGrams, sugars: product.nutrition.sugarsGrams,
    sodium: product.nutrition.sodiumMilligrams, ingredients: product.ingredients, allergens: product.allergens.contains,
    dietary_tags: product.dietaryTags, recommendation_score: product.recommendationScore, display_order: productIndex, is_available: product.available && product.inStock, is_active: true,
    metadata: { inStock: product.inStock, spiceLevel: product.spiceLevel, keywords: product.keywords, vectorTags: product.vectorTags, recommendedWith: product.recommendedWith,
      mayContain: product.allergens.mayContain, crossContaminationPossible: product.allergens.crossContaminationPossible,
      allergenSafetyMessage: product.allergens.safetyMessage, customizations: product.customizations, removableIngredients: product.removableIngredients },
  }));
  await upsert("products", products, "id");
  const oldGroups = await select("product_customization_groups", "id,product_id,source_id");
  const oldGroupKeys = new Set(oldGroups.map(row => `${row.product_id}:${row.source_id}`));
  const groups = catalog.products.flatMap(product => product.customizationGroups.map((group, index) => ({
    product_id: product.id, source_id: group.id, name: group.name, minimum_selections: group.minSelections,
    maximum_selections: group.maxSelections, required: group.required, display_order: index,
  })));
  if (groups.length) await upsert("product_customization_groups", groups, "product_id,source_id");
  const savedGroups = await select("product_customization_groups", "id,product_id,source_id");
  const groupId = new Map(savedGroups.map(row => [`${row.product_id}:${row.source_id}`, row.id]));
  const oldOptions = await select("product_customization_options", "group_id,source_id");
  const oldOptionKeys = new Set(oldOptions.map(row => `${row.group_id}:${row.source_id}`));
  const options = catalog.products.flatMap(product => product.customizationGroups.flatMap(group => group.options.map((option, index) => ({
    group_id: groupId.get(`${product.id}:${group.id}`), source_id: option.id, name: option.name, price_delta: option.priceAdjustment,
    is_available: option.available, display_order: index,
    metadata: { allergensAdded: asList(option.allergensAdded), allergensRemoved: asList(option.allergensRemoved), nutritionAdjustment: option.nutritionAdjustment, default: option.default },
  }))));
  if (options.length) await upsert("product_customization_options", options, "group_id,source_id");
  console.log(JSON.stringify({
    categoriesInserted: categoryRows.filter(row => !beforeCategories.some(old => old.slug === row.slug)).length,
    categoriesUpdated: categoryRows.filter(row => beforeCategories.some(old => old.slug === row.slug)).length,
    productsInserted: products.filter(row => !beforeProducts.some(old => old.id === row.id)).length,
    productsUpdated: products.filter(row => beforeProducts.some(old => old.id === row.id)).length,
    customizationGroupsInserted: groups.filter(row => !oldGroupKeys.has(`${row.product_id}:${row.source_id}`)).length,
    customizationGroupsUpdated: groups.filter(row => oldGroupKeys.has(`${row.product_id}:${row.source_id}`)).length,
    customizationOptionsInserted: options.filter(row => !oldOptionKeys.has(`${row.group_id}:${row.source_id}`)).length,
    customizationOptionsUpdated: options.filter(row => oldOptionKeys.has(`${row.group_id}:${row.source_id}`)).length,
    recordsSkipped: 0, validationFailures: 0,
  }, null, 2));
}

async function verify() {
  const remoteCategories = await select("categories", "slug,image_url,is_active");
  const remote = await select("products", "id,price,image_url,calories,protein,carbohydrates,fat,fiber,sugars,sodium");
  const groups = await select("product_customization_groups", "id,product_id,source_id");
  const options = await select("product_customization_options", "group_id,source_id");
  const localIds = new Set(catalog.products.map(product => product.id)); const remoteIds = new Set(remote.map(product => product.id));
  const missingProductIds = [...localIds].filter(id => !remoteIds.has(id)); const unexpectedProductIds = [...remoteIds].filter(id => !localIds.has(id));
  const priceDifferences = catalog.products.filter(local => { const row = remote.find(product => product.id === local.id); return row && Number(row.price) !== local.price; }).map(product => product.id);
  const missingNutritionalFields = remote.filter(product => ["calories","protein","carbohydrates","fat","fiber","sugars","sodium"].some(key => product[key] == null)).map(product => product.id);
  const groupKeys = new Set(groups.map(group => `${group.product_id}:${group.source_id}`)); const optionKeys = new Set(options.map(option => `${option.group_id}:${option.source_id}`));
  const missingCustomizationRelationships = [];
  for (const product of catalog.products) for (const group of product.customizationGroups) {
    if (!groupKeys.has(`${product.id}:${group.id}`)) missingCustomizationRelationships.push(`${product.id}/${group.id}`);
    const saved = groups.find(row => row.product_id === product.id && row.source_id === group.id);
    for (const option of group.options) if (!saved || !optionKeys.has(`${saved.id}:${option.id}`)) missingCustomizationRelationships.push(`${product.id}/${group.id}/${option.id}`);
  }
  const imageValues = remote.filter(product => productImageById[product.id]).map(product => product.image_url).filter(Boolean);
  const duplicateProductImageValues = [...new Set(imageValues.filter((image, index) => imageValues.indexOf(image) !== index))];
  const sampleIds = ["burger-beef-classic", "burger-chicken-spicy", "pizza-margherita", "pizza-chicken-bbq", "pasta-chicken-alfredo", "pasta-arrabbiata"];
  const sampleProductImages = Object.fromEntries(sampleIds.map(id => [id, remote.find(product => product.id === id)?.image_url ?? null]));
  const missingCategoryImages = remoteCategories.filter(category => category.is_active && !category.image_url).map(category => category.slug);
  const report = { localProducts: catalog.products.length, databaseProducts: remote.length, missingProductIds, unexpectedProductIds, priceDifferences, missingNutritionalFields, missingCustomizationRelationships, missingCategoryImages, duplicateProductImageValues, sampleProductImages };
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report).some(value => Array.isArray(value) && value.length)) process.exitCode = 1;
}

function validateCatalog(value) {
  if (!Array.isArray(value.categories) || !Array.isArray(value.products) || !value.products.length) throw new Error("Local menu is empty or malformed.");
  const ids = new Set();
  for (const product of value.products) {
    if (!product.id || !product.name || !product.category || !Number.isFinite(product.price) || !product.currency || !product.nutrition || !Array.isArray(product.ingredients)) throw new Error(`Missing required local product fields: ${product.id || "(unknown)"}`);
    if (ids.has(product.id)) throw new Error(`Duplicate local product ID: ${product.id}`);
    ids.add(product.id);
  }
}
async function select(table, columns) { const { data, error } = await client.from(table).select(columns); if (error) throw new Error(`${table} read failed: ${error.message}`); return data; }
async function upsert(table, rows, onConflict) { const { error } = await client.from(table).upsert(rows, { onConflict }); if (error) throw new Error(`${table} upsert failed: ${error.message}`); }
function slug(value) { return value.toLowerCase().replaceAll("_", "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"); }
function title(value) { return value.split("_").map(part => part[0].toUpperCase() + part.slice(1)).join(" "); }
function defaultCategoryImage(categorySlug) {
  const images = {
    burger: "/images/category-cutouts/burgers.png",
    pizza: "/images/category-cutouts/pizza.png",
    pasta: "/images/category-cutouts/pasta.png",
    "healthy-bowl": "/images/category-cutouts/salads.png",
    salad: "/images/category-cutouts/salads.png",
    side: "/images/category-cutouts/chicken.png",
    dessert: "/images/category-cutouts/desserts.png",
    "hot-drink": "/images/category-cutouts/coffee.png",
    "cold-drink": "/images/category-cutouts/drinks.png",
    "kids-meal": "/images/category-cutouts/burgers.png",
  };
  return images[categorySlug] ?? null;
}
function asList(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function preserveProductSpecificImage(existing, generated) {
  const value = typeof existing === "string" ? existing.trim() : "";
  return value && (value === generated || !isCategoryPlaceholder(value)) ? value : generated;
}
function isCategoryPlaceholder(value) {
  return /^\/?(?:public\/)?images\/products\/(?:burger|pizza|pasta|salads|chicken|coffee|drink|desserts)\.(?:png|jpe?g|webp)$/i.test(value);
}
